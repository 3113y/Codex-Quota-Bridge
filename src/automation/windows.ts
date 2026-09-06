import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { CqbConfig } from '../config/schema.js';
import type { DesktopController } from '../reviewer/clipboard.js';
import type { ForegroundTarget } from './target-verifier.js';
import { terminateProcessTree } from '../process/bounded.js';
import { parseReviewerBindingSnapshots, type ReviewerBindingSnapshot } from '../setup/reviewer.js';

const execFileAsync = promisify(execFile);

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function powershell(script: string, input?: string, timeoutMs = 15_000): Promise<string> {
  return await new Promise((resolveOutput, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    let settled = false;
    const finish = (error?: Error) => { if (!settled) { settled = true; clearTimeout(timer); error ? reject(error) : resolveOutput(stdout.trim()); } };
    const timer = setTimeout(() => { void terminateProcessTree(child).finally(() => finish(new Error(`PowerShell timed out after ${timeoutMs}ms`))); }, timeoutMs);
    child.on('error', (error) => finish(error));
    child.on('close', (code) => code === 0 ? finish() : finish(new Error(stderr.trim() || `PowerShell exited ${code}`)));
    child.stdin.end(input);
  });
}

const foregroundScript = `
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CQBWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@
$handle = [CQBWindow]::GetForegroundWindow()
$processId = 0
[void][CQBWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
$title = New-Object System.Text.StringBuilder 1024
[void][CQBWindow]::GetWindowText($handle, $title, $title.Capacity)
$process = Get-Process -Id $processId -ErrorAction Stop
@{ processName = $process.ProcessName; title = $title.ToString(); processId = [int]$processId; windowHandle = $handle.ToInt64().ToString() } | ConvertTo-Json -Compress
`;

const reviewerBindingScript = `
param([string[]]$AllowedProcesses)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CQBReviewerBinding {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$candidates = @()
$processes = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $AllowedProcesses -contains $_.ProcessName }
foreach ($process in $processes) {
  try {
    $handle = $process.MainWindowHandle
    $title = New-Object System.Text.StringBuilder 1024
    [void][CQBReviewerBinding]::GetWindowText($handle, $title, $title.Capacity)
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $address = $null
    if ($root) {
      $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit))
      foreach ($element in $edits) {
        if ($element.Current.Name -match '(?i)address and search bar|address bar') {
          try { $address = ($element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).Current.Value } catch {}
        }
      }
    }
    if ($address) { $candidates += @{ processName = $process.ProcessName; title = $title.ToString(); processId = [int]$process.Id; windowHandle = $handle.ToInt64().ToString(); conversationUrl = $address } }
  } catch {}
}
@($candidates) | ConvertTo-Json -Compress
`;

const composerActionScript = `
param([long]$ExpectedHandle, [int]$ExpectedProcessId, [string]$ConversationUrl, [string]$Action)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CQBForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
'@
if ([CQBForeground]::GetForegroundWindow().ToInt64() -ne $ExpectedHandle) { Write-Output 'false'; exit 0 }
$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$ExpectedHandle)
if (-not $root -or $root.Current.ProcessId -ne $ExpectedProcessId) { Write-Output 'false'; exit 0 }
$edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit))
$actualUrl = $null
$composer = $null
foreach ($element in $edits) {
  $name = $element.Current.Name
  if ($name -match '(?i)address and search bar|address bar') {
    try { $actualUrl = ($element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).Current.Value } catch {}
  }
  if ($name -match '(?i)message chatgpt|ask anything|prompt' -and $element.Current.IsEnabled -and $element.Current.IsKeyboardFocusable) { $composer = $element }
}
try {
  $expected = [Uri]$ConversationUrl
  $actual = [Uri]$actualUrl
  $urlValid = $actual.Scheme -eq 'https' -and $actual.Host -eq 'chatgpt.com' -and $actual.AbsolutePath.TrimEnd('/') -eq $expected.AbsolutePath.TrimEnd('/')
} catch { $urlValid = $false }
if (-not $urlValid -or -not $composer) { Write-Output 'false'; exit 0 }
$composer.SetFocus()
$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
if (-not $focused) { Write-Output 'false'; exit 0 }
$same = (@($composer.GetRuntimeId()) -join ',') -eq (@($focused.GetRuntimeId()) -join ',')
if (-not $same -or [CQBForeground]::GetForegroundWindow().ToInt64() -ne $ExpectedHandle) { Write-Output 'false'; exit 0 }
function Get-CQBComposerText($element) {
  try { return ($element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).Current.Value } catch {}
  try { return ($element.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)).DocumentRange.GetText(-1) } catch {}
  return $null
}
function Test-CQBComposerFocus($element) {
  if ([CQBForeground]::GetForegroundWindow().ToInt64() -ne $ExpectedHandle) { return $false }
  $active = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (-not $active) { return $false }
  return ((@($element.GetRuntimeId()) -join ',') -eq (@($active.GetRuntimeId()) -join ','))
}
Add-Type -AssemblyName System.Windows.Forms
$expectedText = ([Console]::In.ReadToEnd() -replace '\r\n', [string][char]10)
if ($Action -eq 'paste') {
  $currentText = Get-CQBComposerText $composer
  if ($null -eq $currentText -or (($currentText -replace '\r\n', [string][char]10).Length -ne 0)) { Write-Output 'false'; exit 0 }
  if (((Get-Clipboard -Raw) -replace '\r\n', [string][char]10) -cne $expectedText) { Write-Output 'false'; exit 0 }
  if (-not (Test-CQBComposerFocus $composer)) { Write-Output 'false'; exit 0 }
  [System.Windows.Forms.SendKeys]::SendWait('^v')
} elseif ($Action -eq 'send') {
  $currentText = Get-CQBComposerText $composer
  if ($null -eq $currentText -or (($currentText -replace '\r\n', [string][char]10) -cne $expectedText)) { Write-Output 'false'; exit 0 }
  if (-not (Test-CQBComposerFocus $composer)) { Write-Output 'false'; exit 0 }
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
} else { Write-Output 'false'; exit 0 }
Write-Output 'true'
`;

export class WindowsDesktopController implements DesktopController {
  constructor(private readonly reviewer: CqbConfig['reviewer']) {}

  async openUrl(url: string): Promise<void> {
    await powershell(`Start-Process -FilePath ${quotePowerShell(url)}`);
  }

  async findTarget(): Promise<ForegroundTarget | undefined> {
    const processes = this.reviewer.allowedProcesses.map(quotePowerShell).join(',');
    const title = quotePowerShell(this.reviewer.expectedWindowTitle);
    const output = await powershell(`$names = @(${processes}); $title = ${title}; $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $names -contains $_.ProcessName -and $_.MainWindowTitle -like "*$title*" } | Select-Object -First 1; if ($p) { @{ processName = $p.ProcessName; title = $p.MainWindowTitle; processId = $p.Id; windowHandle = $p.MainWindowHandle.ToInt64().ToString() } | ConvertTo-Json -Compress }`);
    return output ? JSON.parse(output) as ForegroundTarget : undefined;
  }

  async focus(target: ForegroundTarget): Promise<boolean> {
    const output = await powershell(`Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic class CQBFocus { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }\n'@\n[CQBFocus]::SetForegroundWindow([IntPtr]${target.windowHandle})`);
    return output.toLowerCase() === 'true';
  }

  async getForegroundTarget(): Promise<ForegroundTarget> {
    return JSON.parse(await powershell(foregroundScript)) as ForegroundTarget;
  }

  async captureReviewerBindings(): Promise<ReviewerBindingSnapshot[]> {
    const processes = this.reviewer.allowedProcesses.map(quotePowerShell).join(',');
    const invocation = `& { ${reviewerBindingScript} } -AllowedProcesses @(${processes})`;
    return parseReviewerBindingSnapshots(await powershell(invocation));
  }

  private async composerAction(target: ForegroundTarget, conversationUrl: string, action: 'paste' | 'send', expectedClipboard = ''): Promise<boolean> {
    const invocation = `& { ${composerActionScript} } -ExpectedHandle ${target.windowHandle} -ExpectedProcessId ${target.processId} -ConversationUrl ${quotePowerShell(conversationUrl)} -Action ${quotePowerShell(action)}`;
    try { return (await powershell(invocation, expectedClipboard)).toLowerCase() === 'true'; }
    catch { return false; }
  }

  async pasteVerified(target: ForegroundTarget, conversationUrl: string, expectedClipboard: string): Promise<boolean> {
    return this.composerAction(target, conversationUrl, 'paste', expectedClipboard);
  }

  async sendVerified(target: ForegroundTarget, conversationUrl: string, expectedComposer: string): Promise<boolean> {
    return this.composerAction(target, conversationUrl, 'send', expectedComposer);
  }

  async setClipboard(value: string): Promise<void> {
    await powershell('$value = [Console]::In.ReadToEnd(); Set-Clipboard -Value $value', value);
  }

  async getClipboard(): Promise<string> {
    return powershell('Get-Clipboard -Raw');
  }

  async notify(title: string, message: string): Promise<void> {
    try { await execFileAsync('msg.exe', ['*', `${title}: ${message}`], { windowsHide: true }); }
    catch { process.stderr.write(`${title}: ${message}\n`); }
  }
}

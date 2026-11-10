' Starts the ticket server in background (if not running) and opens the app window.
' Keep this file ASCII-only (wscript reads it in ANSI).
Option Explicit

Dim sh, fso, root, port, url, browser, p, f, line, i, cands

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root

' port from .env (default 3000)
port = "3000"
If fso.FileExists(root & "\.env") Then
  Set f = fso.OpenTextFile(root & "\.env", 1)
  Do While Not f.AtEndOfStream
    line = Trim(f.ReadLine)
    If UCase(Left(line, 5)) = "PORT=" Then port = Trim(Mid(line, 6))
  Loop
  f.Close
End If
url = "http://localhost:" & port

Function Alive()
  On Error Resume Next
  Dim h
  Set h = CreateObject("MSXML2.ServerXMLHTTP")
  h.setTimeouts 1000, 1000, 1000, 1000
  h.open "GET", url & "/api/me", False
  h.send
  Alive = (Err.Number = 0 And h.status = 200)
  On Error GoTo 0
End Function

If Not Alive() Then
  If Not fso.FolderExists(root & "\data") Then fso.CreateFolder root & "\data"
  sh.Run "cmd /c ""node --env-file=.env server\index.js >> data\server.log 2>&1""", 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If Alive() Then Exit For
  Next
End If

If Not Alive() Then
  MsgBox "Server did not start. See data\server.log", 16, "Tickets"
  WScript.Quit 1
End If

' find Chrome, else Edge (Edge is always present on Windows 10/11)
browser = ""
cands = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe")
For Each p In cands
  If browser = "" Then
    If fso.FileExists(p) Then browser = p
  End If
Next

If browser = "" Then
  sh.Run url, 1, False
Else
  ' own profile => the --kiosk-printing flag is always applied (silent printing, no dialog)
  sh.Run """" & browser & """ --kiosk-printing --user-data-dir=""" & root & "\data\browser-profile"" --no-first-run --app=" & url, 1, False
End If

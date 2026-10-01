@echo off
REM Runs a test suite from test-plans\suites\, like testng.bat ran testng.xml.
REM Usage: suite.bat smoke [--no-email] [--email-dry-run] [playwright options, e.g. --headed]
REM After the run, the results are emailed to the recipients in project.json.
cd /d "%~dp0"
node scripts\run-suite.js %*
exit /b %ERRORLEVEL%

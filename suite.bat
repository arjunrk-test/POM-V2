@echo off
REM Runs a test suite from test-plans\suites\, like testng.bat ran testng.xml.
REM Usage: suite.bat smoke [playwright options, e.g. --headed]
cd /d "%~dp0"
node scripts\run-suite.js %*
exit /b %ERRORLEVEL%

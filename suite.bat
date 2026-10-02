@echo off
REM Runs test suites from test-plans\suites\, like testng.bat ran testng.xml.
REM Usage: suite.bat smoke                  one suite
REM        suite.bat smoke regression api   several suites, one after another
REM        suite.bat --all                  every suite
REM Options: --no-email, --email-dry-run, and any Playwright option (e.g. --headed).
REM After the run, the results are emailed to the recipients in project.json
REM (one combined email when several suites ran).
cd /d "%~dp0"
node scripts\run-suite.js %*
exit /b %ERRORLEVEL%

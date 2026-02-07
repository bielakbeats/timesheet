set projectPath to "/Users/joebielak/Documents/New project"

try
  do shell script "lsof -i :8080 >/dev/null"
  set serverRunning to true
on error
  set serverRunning to false
end try

if serverRunning is false then
  do shell script "cd " & quoted form of projectPath & "; python3 -m http.server 8080 >/tmp/timesheet.log 2>&1 &"
  delay 0.5
end if

do shell script "open http://localhost:8080"

; Windows uninstaller: empty the website blocklist so the background helper
; removes every block from the hosts file, even if a block was running.
!macro customUnInstall
  ReadEnvStr $1 PROGRAMDATA
  IfFileExists "$1\HalyraFocus\blocklist.txt" 0 +3
    FileOpen $0 "$1\HalyraFocus\blocklist.txt" w
    FileClose $0
!macroend

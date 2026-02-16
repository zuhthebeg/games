#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/games

PROMPT=$(cat /mnt/c/Users/user/games/codex-prompt.txt)

codex --full-auto "$PROMPT"

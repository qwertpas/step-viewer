#!/bin/zsh
cd "${0:A:h}" || exit 1
if [[ ! -d node_modules ]]; then
  npm install || exit 1
fi
(sleep 1; open http://127.0.0.1:5173) &
npm run dev

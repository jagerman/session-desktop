#!/bin/bash

set -e

target="$1"

if [ "$target" == "all" ] || [ "$target" == "" ]; then
    target='["deb", "rpm", "freebsd"]'
else
    target="\"$target\""
fi

sed -i 's/"target": \(\[\("[^"]*", *\)*"[^"]*"\]\|"[^"]*"\)/"target": '"$target/" package.json

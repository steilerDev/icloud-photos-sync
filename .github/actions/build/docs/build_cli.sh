#!/bin/bash

OUT_FILE="$1/user-guides/cli.md"
BIN="$2"
> $OUT_FILE

echo '# CLI Reference' >> $OUT_FILE
echo '' >> $OUT_FILE
echo '```' >> $OUT_FILE
$BIN --help >> $OUT_FILE
echo '```' >> $OUT_FILE
echo '' >> $OUT_FILE

echo '## `token` command' >> $OUT_FILE
echo '' >> $OUT_FILE
echo '```' >> $OUT_FILE
$BIN token --help >> $OUT_FILE
echo '```' >> $OUT_FILE
echo '' >> $OUT_FILE

echo '## `sync` command'  >> $OUT_FILE
echo '' >> $OUT_FILE
echo '```' >> $OUT_FILE
$BIN sync --help >> $OUT_FILE
echo '```' >> $OUT_FILE
echo '' >> $OUT_FILE

echo '## `archive` command' >> $OUT_FILE
echo '' >> $OUT_FILE
echo '```' >> $OUT_FILE
$BIN archive --help >> $OUT_FILE
echo '```' >> $OUT_FILE

echo '## `daemon` command' >> $OUT_FILE
echo '' >> $OUT_FILE
echo '```' >> $OUT_FILE
$BIN daemon --help >> $OUT_FILE
echo '```' >> $OUT_FILE
#!/usr/bin/env bash
# stress.sh [max_tests] [timeout_seconds]

MAX=${1:-999999999}
TO=${2:-2}

# compile/optimize each time so you can't accidentally run stale code
g++ gen.cpp        -std=c++17 -O2 -o gen
g++ solution.cpp   -std=c++17 -O2 -o solution
g++ brute.cpp      -std=c++17 -O2 -o brute

count=0
while (( count < MAX )); do
  (( count++ ))

  # generate
  ./gen > input.txt

  # run solution with timeout
  if ! timeout ${TO}s ./solution < input.txt > out1.txt; then
    echo "❌ Timeout on solution at case $count"
    cp input.txt  failed_input.txt
    cp out1.txt   failed_solution.txt
    exit 1
  fi

  # run brute with timeout
  if ! timeout ${TO}s ./brute < input.txt > out2.txt; then
    echo "❌ Timeout on brute at case $count"
    cp input.txt  failed_input.txt
    cp out2.txt   failed_brute.txt
    exit 1
  fi

  # compare
  if ! diff -w out1.txt out2.txt > /dev/null; then
    echo "❌ Test failed on case $count"
    echo
    echo "=== INPUT ==="
    cat input.txt
    echo
    echo "=== YOUR OUTPUT ==="
    cat out1.txt
    echo
    echo "=== BRUTE OUTPUT ==="
    cat out2.txt

    # save files for external inspection
    cp input.txt  failed_input.txt
    cp out1.txt   failed_solution.txt
    cp out2.txt   failed_brute.txt
    exit 1
  fi

  echo "✅ Passed test #$count"
done

exit 0

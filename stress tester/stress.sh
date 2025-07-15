#!/bin/bash

g++ 2.cpp -o main
g++ brute.cpp -o brute
g++ gen.cpp -o gen

count=0
while true; do
    ./gen > in.txt
    ./main < in.txt > out1.txt
    ./brute < in.txt > out2.txt
    diff -w out1.txt out2.txt || {
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
        exit 1
    }
    echo "✅ Passed test #$count"
    ((count++))
done

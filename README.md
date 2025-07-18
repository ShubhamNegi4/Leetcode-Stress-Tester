# LeetCode Stress Tester

A Visual Studio Code extension for competitive programmers to fetch LeetCode problems, set up local C++ testing environments, and stress-test your solutions with random and sample test cases—all from within your editor.

---

## 🚀 Features

- **Fetch LeetCode Problems:** Enter a problem ID or slug to automatically download the problem statement, sample cases, and official solution.
- **Automatic File Setup:** Generates `solution.cpp`, `brute.cpp`, `gen.cpp`, and input files in a dedicated `stress tester/` directory.
- **Sample & Stress Testing:**
  - Run sample test cases to quickly check your solution.
  - Run stress tests with randomly generated inputs and compare your solution against the brute-force solution.
- **Visual Feedback:** See progress, pass/fail status, and detailed error cases directly in the VS Code UI.
- **Customizable Test Generation:** Edit `gen.cpp` to control how random test cases are generated.
- **Logs & Debugging:** Automatically saves failing test cases and outputs for easy debugging.

---

## 🛠️ Installation

1. **Package the Extension:**
   - Install `vsce` if you haven't:
     ```sh
     sudo npm install -g vsce
     ```
   - Package the extension:
     ```sh
     vsce package
     ```
   - This creates a `.vsix` file in your project directory.

2. **Install in VS Code:**
   - Open VS Code.
   - Press `Ctrl+Shift+P` and select `Extensions: Install from VSIX...`.
   - Choose the generated `.vsix` file.

---

## 🧑‍💻 Usage

1. **Open the Command Palette** (`Ctrl+Shift+P`) and run `LeetCode Stress Tester`.
2. **Enter a LeetCode problem ID or slug** in the UI.
3. **Edit `solution.cpp`** in the `stress tester/` directory with your solution.
4. **Edit `gen.cpp`** if you want to customize random test generation.
5. **Run Sample or Stress Tests** using the UI buttons:
   - **Run Samples:** Tests your solution on LeetCode's sample cases.
   - **Run Stress:** Runs your solution and the official solution on many random cases, comparing outputs.
6. **Debug:** If a test fails, the input and outputs are saved for inspection in the `stress tester/` directory.

---

## 📁 Project Structure

```
leetcode-stress-tester/
├── src/
│   ├── frontend/         # VS Code extension UI and logic
│   └── utils/            # Node.js utilities for fetching and testing
├── stress tester/        # All C++ files and test logs
│   ├── gen.cpp           # Random test case generator (edit as needed)
│   ├── solution.cpp      # Your solution (edit this)
│   ├── brute.cpp         # Brute-force solution (auto-fetched)
│   ├── input.txt         # Current test input
│   ├── all_input.txt     # All inputs for failed stress tests
│   ├── solution_output.txt  # Your solution's outputs
│   ├── brute_output.txt     # Brute-force solution's outputs
│   └── stress.sh         # Bash script for manual stress testing
├── README.md
└── ...
```
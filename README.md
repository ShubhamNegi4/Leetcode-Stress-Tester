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

1. **Open the "Stress Tester" panel** from the VS Code activity bar (left sidebar, beaker icon).
2. **Enter a LeetCode problem ID or slug** in the input field at the top of the panel.
3. **Click one of the three buttons**:
   - **📥 Fetch Problem:** Downloads the problem, sets up files, and fetches sample cases and solutions.
   - **🧪 Run Samples:** Runs your solution on LeetCode's sample cases.
   - **⚡ Run Stress Tests:** Runs your solution and the brute-force solution on many random cases, comparing outputs.
4. **Edit `solution.cpp`** in the `stress tester/` directory with your solution.
5. **Edit `gen.cpp`** if you want to customize random test generation.
6. **Debug:** If a test fails, the input and outputs are saved for inspection in the `stress tester/` directory. Logs and status messages appear in the panel.

---

## 📁 Project Structure

```
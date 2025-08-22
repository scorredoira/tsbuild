A TypeScript bundler for Sim projects

## Installation

```bash
sim install github.com/scorredoira/tsbuild
```

## Usage

```bash
# Bundle current directory to out.js
sim tsbuild

# Bundle specific source file/directory
sim tsbuild -s src

# Bundle with custom output
sim tsbuild -s src -o bundle.js

# Bundle with minification
sim tsbuild -m

# Verbose output
sim tsbuild -v
```

## Options

- `-s`: Source file or directory (default: ".")
- `-o`: Output file (default: "out.js")
- `-m`: Minify output
- `-v`: Verbose output

## Requirements

- esbuild must be installed in your system
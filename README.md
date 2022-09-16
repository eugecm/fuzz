# Fuzz

Fuzzy search code. ripgrep + fzf

## WARNING

This extension is still alpha stage. In some circumstances it may make your
system unstable. You've been warned!

## Requirements

The following programs must be installed in order for the extension to work:
- [ripgrep](https://github.com/BurntSushi/ripgrep)
- [fzf](https://github.com/junegunn/fzf)

## How to use

By default it binds the `fuzz.search` to `ctrl+shift+t`.

## Why another search extension?

All the search extensions I've tried so far either do exact matching or regular
expression matching. This extension relies on fzf for searching through code,
which makes the search fuzzy. A search term with small typos will still
most likely give you want you're searching for.
import * as vscode from "vscode";
import * as cp from "child_process";

const PROCESS_TIMEOUT_MILLIS = 5_000; // Allow processes to run for up to 5 seconds.

class SearchResult {
  public readonly filePath: string;
  public readonly lineNumber: number;
  public readonly line: string;

  constructor(location: string, lineNumber: number, line: string) {
    this.filePath = location;
    this.lineNumber = lineNumber;
    this.line = line;
  }
}

class SearchEntryQuickPickItem implements vscode.QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  alwaysShow: boolean;
  public result: SearchResult;

  constructor(result: SearchResult) {
    let workspaceFolder = "";
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders !== undefined) {
      workspaceFolder = workspaceFolders[0].uri.fsPath;
    }
    this.result = result;
    this.detail =
      result.filePath.replace(workspaceFolder, "") + ":" + result.lineNumber;
    this.label = result.line.trim();
    this.alwaysShow = true;
  }
}

const search = (term: string, limit: number) =>
  new Promise<SearchResult[]>((resolve, reject) => {
    if (term.length === 0) {
      return resolve([]);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined) {
      reject("no workspaces available");
      return;
    }
    const workspaceFolder = workspaceFolders[0].uri.fsPath;

    let output = "";
    const rg = cp.spawn(
      "rg",
      [
        "--glob=!node_modules",
        "--column",
        "--line-number",
        "--no-heading",
        "--color=never",
        "--smart-case",
        "--field-match-separator=:",
        "--max-filesize=1M",
        ".",
        workspaceFolder,
      ],
      {
        timeout: PROCESS_TIMEOUT_MILLIS,
      }
    );
    const fzf = cp.spawn("fzf", ["-f", term], {
      timeout: PROCESS_TIMEOUT_MILLIS,
    });
    const head = cp.spawn("head", ["-n", limit.toString()]);

    // Pipe outputs
    rg.stdout.on("data", (data) => {
      fzf.stdin.write(data);
    });
    fzf.stdout.on("data", (data) => {
      head.stdin.write(data);
    });
    head.stdout.on("data", (data) => {
      output += data.toString();
    });

    rg.on("close", (_code) => {
      // TODO: Verify exit code
      fzf.stdin.end();
    });
    rg.on("exit", (_code, signal) => {
      // process will be terminated using SIGTERM if it takes too long to run.
      // Tell the user what happened.
      if (signal === "SIGTERM") {
        reject(
          "'rg' command took too long to run, so it was stopped. This normally happens when your project has too many files. Make sure your .gitignore is ignoring files you don't want to include in your search"
        );
      }
    });
    fzf.on("close", (_code) => {
      // TODO: Verify exit code
      head.stdin.end();
    });
    fzf.on("exit", (_code, signal) => {
      // process will be terminated using SIGTERM if it takes too long to run.
      // Tell the user what happened.
      if (signal === "SIGTERM") {
        reject(
          "'fzf' command took too long to run, so it was stopped. This normally happens when your project has too many files. Make sure your .gitignore is ignoring files you don't want to include in your search"
        );
      }
    });
    head.on("close", (_code) => {
      // TODO: Verify exit code
      resolve(
        output
          .split("\n")
          .slice(0, limit)
          .map((rawLine) => {
            const parts = rawLine.split(":");
            const filePath = parts[0];
            const lineNumber = Number(parts[1]);
            const line = parts.slice(2)[1];
            return new SearchResult(filePath, lineNumber, line);
          })
      );
    });

    // Errors
    rg.on("error", (code) => {
      if (code.message.endsWith("ENOENT")) {
        reject("'rg' command not found. Make sure ripgrep is installed");
      } else {
        reject(code);
      }
    });
    fzf.on("error", (code) => {
      if (code.message.endsWith("ENOENT")) {
        reject("'fzf' command not found. Make sure fzf is installed");
      } else {
        reject(code);
      }
    });
  });

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("fuzz.search", () => {
    let qp = vscode.window.createQuickPick();
    (qp as any).sortByLabel = false;
    let timer: NodeJS.Timer;
    qp.onDidChangeValue(async (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          let results = await search(e, 20);
          qp.items = results
            .slice(0, 20)
            .map((r) => new SearchEntryQuickPickItem(r));
        } catch (e) {
          if (typeof e === "string") {
            vscode.window.showErrorMessage(e);
          } else if (e instanceof Error) {
            vscode.window.showErrorMessage(e.message);
          }
          console.log(`error: ${e}`);
        }
      }, 500);
    });

    qp.onDidChangeActive(async () => {
      let result = (qp.activeItems[0] as SearchEntryQuickPickItem).result;
      let document = await vscode.workspace.openTextDocument(result.filePath);
      let range = new vscode.Range(result.lineNumber, 0, result.lineNumber, 0);
      let editor = await vscode.window.showTextDocument(document, {
        selection: range,
        preview: true,
        preserveFocus: true,
      });
    });

    qp.onDidAccept(async () => {
      let result = (qp.activeItems[0] as SearchEntryQuickPickItem).result;
      let document = await vscode.workspace.openTextDocument(result.filePath);
      let editor = await vscode.window.showTextDocument(document, undefined);
      let range = new vscode.Range(result.lineNumber, 0, result.lineNumber, 0);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range);
      qp.dispose();
    });

    qp.show();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

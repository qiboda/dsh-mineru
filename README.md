# dsh-mineru

DSH plugin: run [MinerU](https://github.com/opendatalab/MinerU) from the DSH web client,
convert the parsed Markdown to HTML, keep both the intermediate MinerU zip and the final
standalone HTML, preview the HTML in the browser, select any text in the preview and quote
it straight into the DSH input box.

## Features

| Feature | Description |
|---|---|
| `mineru_parse_pdf` tool | The agent can parse a PDF path: runs `mineru -p <pdf> -o <docDir>`, finds the generated zip, unzips it, converts the Markdown to standalone HTML with pandoc, and registers the output in the library index. |
| `mineru_list_parses` tool | Lists all parsed documents in the library. |
| Persistent storage | Outputs are stored under `~/Downloads/mineru-outputs/<id>/`; the library index lives at `~/.dsh/mineru-library.json` (both overridable via `DSH_MINERU_LIBRARY` / `DSH_MINERU_INDEX`). |
| Settings page | A "MinerU" section in the DSH Settings page (`settings.section`) lets the user change `libraryRoot`, `indexFile`, `mineruBin`, and default `backend` / `method` / `effort` / `lang`. Path fields have a native "选择…" button (zenity) so you can pick a folder or file instead of typing the path. Changes apply live, no server restart. |
| Browser preview | The client lists parsed documents and shows the final HTML in a same-origin iframe (`/mineru/preview/<id>`). When DSH-better-sidebar is installed, the launcher opens a **MinerU sidebar tab** so you can read the document while continuing to chat; without better-sidebar it falls back to the modal. |
| Resizable preview | Drag the divider between the document list and the HTML preview to adjust the preview width; the split is remembered in `localStorage`. The document-list sidebar can also be hidden/shown with the `⟨`/`⟩` button in the preview bar. |
| Last position restore | The last opened document and its scroll position are remembered **per DSH session** in `localStorage` (`dsh-mineru-current-doc:<sessionId>`, `dsh-mineru-scroll:<sessionId>:<id>`). Re-opening the MinerU panel/tab, or switching DSH conversations while the tab stays open, loads that session's last document and restores its previous reading position. |
| Auto-open current doc | If a MinerU panel is rebuilt while a document is already selected (for example after closing/reopening the sidebar tab), the iframe is populated with that document automatically instead of staying blank. |
| DSH theme-aware HTML | The preview iframe injects a matching stylesheet from DSH's theme tokens (`--dsw-alias-*`), so dark/light theme changes also restyle the rendered MinerU HTML. |
| Async parse progress | The client parses through an async job (`/mineru/api/parse` → `/mineru/api/jobs/<id>`) and shows a live progress bar (MinerU phase percentages such as “Layout Predict 42%”). |
| Select-and-quote | Select text inside the preview iframe; a "引用到对话" button appears and adds the quote to a **MinerU 引用 dock above the composer** (same slot as the official TODO strip). The quote includes document metadata (document id/title, PDF/HTML/ZIP paths, preview link), the **HTML heading path** of the selected passage (`h2 > h3 …`), and an image mention when the selection contains pictures. On Enter **or the composer send button** the quote block is attached to the draft automatically, so the agent can locate the source while answering. After a successful send the quote dock is cleared so the same quote is not resent with the next message. |
| Quote dock | A compact strip above the input box lists all pending MinerU references; each item can be removed, and the whole list can be cleared. It renders in the `conversation.input.dock` slot, matching the official TodoPanel posture. |
| Document menu | Each list item has a `⋯` menu: open in new tab, download zip, rename, and delete (with confirmation). Delete removes the plugin-owned output directory only, never the source PDF. |
| Download zip | Each document entry links to `/mineru/download/<id>` for the original MinerU zip. |

## Install

### From GitHub (public)

```sh
dsh plugin --profile web add git+https://github.com/qiboda/dsh-mineru.git
```

Then reload/restart the DSH web service as usual and hard-refresh the browser.

### Source install (as used in this workspace)

```sh
cd ~/codes/dsh-mineru
# The plugin is plain JS host + hand-written CJS client, no build required:
# lib/index.js and client.js are already the runtime artifacts.
# Then:
#   dev_install_package --dir ~/codes/dsh-mineru --profile web
#   (or, after a server restart, profile package.json link + bundles entry)
```

## Layout

```
dsh-mineru/
  package.json          # dsh.bundle.patch + dsh.client declaration
  cordis.patch.yml      # inserts the host plugin row
  lib/index.js          # host: tools + webServer routes
  lib/client.js         # browser bundle (mirror of client.js, kept for reload tooling)
  client.js             # browser source: launcher + modal + preview + select-to-quote
  README.md
```

## Example

Ask the agent: “用 MinerU 解析这个 PDF：/home/skwy/Downloads/foo.pdf”

The agent calls `mineru_parse_pdf` with `{ pdf }`; the tool returns the paths plus a
preview id. Open the MinerU client launcher in DSH web (top-right “MinerU” button),
select the document, preview the HTML, select text, and press “引用到对话”.

## Notes

- First MinerU run may download models; the subsequent runs are faster.
- `pandoc` and `unzip` must be available (`command -v pandoc unzip`).
- The path pickers use `zenity` (`command -v zenity`); if it is not available,
  path fields still accept typed absolute paths.
- To change defaults: use the DSH Settings page → MinerU, or the environment
  variables `DSH_MINERU_LIBRARY`, `DSH_MINERU_INDEX`, `MINERU_BIN`.

#!/usr/bin/env python3
"""Convert docs/*.md to docs/pages/*.html with consistent navigation."""

import re
import sys
import html as html_module
from pathlib import Path

DOCS_DIR = Path(__file__).parent.parent
PAGES_DIR = Path(__file__).parent

PAGES = [
    ("index.html", "Home", None),
    ("brd.html", "BRD", "BRD.md"),
    ("edd.html", "EDD", "EDD.md"),
    ("api.html", "API Reference", "API.md"),
    ("arch.html", "Architecture", "ARCH.md"),
    ("schema.html", "Database Schema", "SCHEMA.md"),
    ("test-plan.html", "Test Plan", "TEST-PLAN.md"),
    ("diagrams.html", "Diagrams", "DIAGRAMS.md"),
    ("alignment.html", "Alignment Report", "ALIGNMENT-REPORT.md"),
    ("smoke-test.html", "Smoke Test", "SMOKE-TEST-REPORT.md"),
]

NAV_ITEMS = [
    ("index.html", "Home", "🏠", "main"),
    ("brd.html", "BRD", "📋", "main"),
    ("edd.html", "EDD", "⚙️", "main"),
    ("api.html", "API Reference", "🔌", "main"),
    ("arch.html", "Architecture", "🏗️", "main"),
    ("schema.html", "Database Schema", "🗄️", "main"),
    ("test-plan.html", "Test Plan", "✅", "main"),
    ("diagrams.html", "Diagrams", "📊", "main"),
    ("alignment.html", "Alignment Report", "🎯", "reports"),
    ("smoke-test.html", "Smoke Test", "🔍", "reports"),
]


def build_nav_html(active_page: str) -> str:
    """Build sidebar navigation HTML."""
    items_main = []
    items_reports = []
    for (href, label, icon, section) in NAV_ITEMS:
        active_class = " active" if href == active_page else ""
        item = (
            f'<a href="{href}" class="nav-item{active_class}">'
            f'<span class="nav-icon">{icon}</span>'
            f'{html_module.escape(label)}'
            f'</a>'
        )
        if section == "main":
            items_main.append(item)
        else:
            items_reports.append(item)

    nav = (
        '<div class="nav-section-label">Documentation</div>\n'
        + "\n".join(items_main)
        + '\n<div class="nav-section-label" style="margin-top:1rem">Reports</div>\n'
        + "\n".join(items_reports)
    )
    return nav


def slugify(text: str) -> str:
    """Convert heading text to anchor id."""
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[\s_]+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    return text


def escape_html_in_code(text: str) -> str:
    """Escape HTML entities inside code."""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )


def apply_inline_formatting(text: str) -> str:
    """Apply bold, italic, inline code, and links to a text segment."""
    # Inline code (must come before bold/italic to avoid conflicts)
    text = re.sub(
        r'`([^`]+)`',
        lambda m: '<code>' + escape_html_in_code(m.group(1)) + '</code>',
        text
    )
    # Bold+Italic
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', text)
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'_([^_]+)_', r'<em>\1</em>', text)
    # Links
    text = re.sub(
        r'\[([^\]]+)\]\(([^)]+)\)',
        r'<a href="\2">\1</a>',
        text
    )
    # Images (render as img or alt text)
    text = re.sub(
        r'!\[([^\]]*)\]\(([^)]+)\)',
        r'<img src="\2" alt="\1" style="max-width:100%;">',
        text
    )
    return text


def md_to_html(md_content: str) -> tuple[str, list[tuple[int, str, str]]]:
    """
    Convert markdown to HTML.
    Returns (html_string, headings_list) where headings_list is
    a list of (level, text, anchor_id) tuples.
    """
    lines = md_content.split('\n')
    out = []
    headings: list[tuple[int, str, str]] = []

    i = 0
    in_code_block = False
    code_lang = ''
    code_lines: list[str] = []
    in_list_ul = False
    in_list_ol = False
    in_table = False
    table_rows: list[list[str]] = []
    table_has_header = False
    in_blockquote = False
    blockquote_lines: list[str] = []
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        if paragraph_lines:
            inner = apply_inline_formatting(' '.join(paragraph_lines))
            out.append(f'<p>{inner}</p>')
            paragraph_lines.clear()

    def flush_list() -> None:
        nonlocal in_list_ul, in_list_ol
        if in_list_ul:
            out.append('</ul>')
            in_list_ul = False
        if in_list_ol:
            out.append('</ol>')
            in_list_ol = False

    def flush_table() -> None:
        nonlocal in_table, table_rows, table_has_header
        if in_table and table_rows:
            html = '<div class="table-wrapper"><table>\n'
            start_row = 0
            if table_has_header and len(table_rows) >= 1:
                html += '<thead><tr>'
                for cell in table_rows[0]:
                    html += f'<th>{apply_inline_formatting(cell.strip())}</th>'
                html += '</tr></thead>\n'
                start_row = 2 if len(table_rows) > 1 else 1  # skip separator row
            html += '<tbody>\n'
            for row in table_rows[start_row:]:
                html += '<tr>'
                for cell in row:
                    html += f'<td>{apply_inline_formatting(cell.strip())}</td>'
                html += '</tr>\n'
            html += '</tbody></table></div>'
            out.append(html)
        in_table = False
        table_rows.clear()
        table_has_header = False

    def flush_blockquote() -> None:
        nonlocal in_blockquote, blockquote_lines
        if in_blockquote:
            inner_md = '\n'.join(blockquote_lines)
            inner_html, _ = md_to_html(inner_md)
            out.append(f'<blockquote>{inner_html}</blockquote>')
            in_blockquote = False
            blockquote_lines.clear()

    while i < len(lines):
        line = lines[i]

        # ── Fenced code blocks ──────────────────────────────────────────────
        fence_match = re.match(r'^(`{3,}|~{3,})(\w*)\s*$', line)
        if fence_match and not in_code_block:
            flush_paragraph()
            flush_list()
            flush_table()
            flush_blockquote()
            in_code_block = True
            code_lang = fence_match.group(2).lower()
            code_lines = []
            i += 1
            continue

        if in_code_block:
            if re.match(r'^(`{3,}|~{3,})\s*$', line):
                in_code_block = False
                code_text = '\n'.join(code_lines)
                if code_lang == 'mermaid':
                    escaped = escape_html_in_code(code_text)
                    out.append(
                        '<div class="mermaid-wrapper">'
                        '<div class="mermaid-label">Diagram (Mermaid)</div>'
                        f'<div class="mermaid">{escaped}</div>'
                        '</div>'
                    )
                else:
                    escaped = escape_html_in_code(code_text)
                    lang_label = code_lang if code_lang else 'code'
                    out.append(
                        '<div class="code-block-wrapper">'
                        f'<div class="code-lang-label">{html_module.escape(lang_label)}</div>'
                        f'<pre><code class="language-{html_module.escape(lang_label)}">'
                        f'{escaped}</code></pre>'
                        '</div>'
                    )
                code_lang = ''
                code_lines = []
            else:
                code_lines.append(line)
            i += 1
            continue

        # ── Blockquotes ─────────────────────────────────────────────────────
        bq_match = re.match(r'^>\s?(.*)', line)
        if bq_match:
            flush_paragraph()
            flush_list()
            flush_table()
            in_blockquote = True
            blockquote_lines.append(bq_match.group(1))
            i += 1
            continue
        elif in_blockquote:
            flush_blockquote()

        # ── Horizontal rules ────────────────────────────────────────────────
        if re.match(r'^(\-{3,}|\*{3,}|_{3,})\s*$', line):
            flush_paragraph()
            flush_list()
            flush_table()
            flush_blockquote()
            out.append('<hr>')
            i += 1
            continue

        # ── Headings ────────────────────────────────────────────────────────
        heading_match = re.match(r'^(#{1,6})\s+(.*)', line)
        if heading_match:
            flush_paragraph()
            flush_list()
            flush_table()
            flush_blockquote()
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            # Strip trailing #
            text = re.sub(r'\s+#+\s*$', '', text)
            anchor = slugify(text)
            # Make anchor unique by appending count if needed
            count = sum(1 for h in headings if h[2] == anchor)
            if count > 0:
                anchor = f'{anchor}-{count}'
            headings.append((level, text, anchor))
            display = apply_inline_formatting(text)
            out.append(f'<h{level} id="{anchor}">{display}</h{level}>')
            i += 1
            continue

        # ── Tables ──────────────────────────────────────────────────────────
        if re.match(r'^\|.*\|', line):
            flush_paragraph()
            flush_list()
            flush_blockquote()
            cells = [c for c in line.split('|')]
            # Remove first/last empty from leading/trailing |
            if cells and cells[0].strip() == '':
                cells = cells[1:]
            if cells and cells[-1].strip() == '':
                cells = cells[:-1]

            # Check if this is a separator row (---|---|---)
            is_separator = all(re.match(r'^[\s\-:]+$', c) for c in cells)
            if is_separator:
                table_has_header = True
            else:
                if not in_table:
                    in_table = True
                    table_rows = []
                table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            flush_table()

        # ── Unordered lists ─────────────────────────────────────────────────
        ul_match = re.match(r'^(\s*)[-*+]\s+(.*)', line)
        if ul_match:
            flush_paragraph()
            flush_table()
            flush_blockquote()
            if in_list_ol:
                out.append('</ol>')
                in_list_ol = False
            if not in_list_ul:
                out.append('<ul>')
                in_list_ul = True
            inner = apply_inline_formatting(ul_match.group(2))
            out.append(f'<li>{inner}</li>')
            i += 1
            continue

        # ── Ordered lists ────────────────────────────────────────────────────
        ol_match = re.match(r'^(\s*)\d+[.)]\s+(.*)', line)
        if ol_match:
            flush_paragraph()
            flush_table()
            flush_blockquote()
            if in_list_ul:
                out.append('</ul>')
                in_list_ul = False
            if not in_list_ol:
                out.append('<ol>')
                in_list_ol = True
            inner = apply_inline_formatting(ol_match.group(2))
            out.append(f'<li>{inner}</li>')
            i += 1
            continue

        # ── Blank lines ──────────────────────────────────────────────────────
        if line.strip() == '':
            flush_paragraph()
            flush_list()
            flush_table()
            flush_blockquote()
            i += 1
            continue

        # ── Raw HTML passthrough ─────────────────────────────────────────────
        if line.strip().startswith('<') and line.strip().endswith('>'):
            flush_paragraph()
            flush_list()
            flush_table()
            flush_blockquote()
            out.append(line)
            i += 1
            continue

        # ── Regular paragraph text ────────────────────────────────────────────
        flush_list()
        flush_table()
        flush_blockquote()
        paragraph_lines.append(line.strip())
        i += 1

    # Flush any remaining
    flush_paragraph()
    flush_list()
    flush_table()
    flush_blockquote()

    return '\n'.join(out), headings


def build_toc(headings: list[tuple[int, str, str]]) -> str:
    """Build a table of contents from headings (h2 and h3 only)."""
    items = [(level, text, anchor) for (level, text, anchor) in headings if level in (2, 3)]
    if len(items) < 3:
        return ''
    lines = ['<div class="toc-panel"><h4>Contents</h4><ul class="toc-list">']
    for (level, text, anchor) in items:
        css_class = 'toc-h3' if level == 3 else ''
        li_class = f' class="{css_class}"' if css_class else ''
        lines.append(f'<li{li_class}><a href="#{anchor}">{html_module.escape(text)}</a></li>')
    lines.append('</ul></div>')
    return '\n'.join(lines)


def build_page(title: str, content_html: str, active_page: str, toc_html: str = '') -> str:
    """Wrap content in full HTML page with nav."""
    nav_html = build_nav_html(active_page)
    breadcrumb = ''
    if active_page != 'index.html':
        breadcrumb = (
            '<div class="breadcrumb">'
            '<a href="index.html">Home</a>'
            '<span>›</span>'
            f'<span>{html_module.escape(title)}</span>'
            '</div>'
        )

    page_header = ''
    if active_page != 'index.html':
        page_header = f'''
  <header class="page-header">
    <div class="page-header-inner">
      {breadcrumb}
      <div class="page-title-row">
        <h1 class="page-title">{html_module.escape(title)}</h1>
      </div>
    </div>
  </header>'''

    sidebar_toggle_js = '''
    <script>
    (function() {
      var toggle = document.querySelector('.sidebar-toggle');
      var sidebar = document.querySelector('.sidebar');
      var overlay = document.querySelector('.sidebar-overlay');
      if (!toggle) return;
      toggle.addEventListener('click', function() {
        var open = sidebar.classList.toggle('open');
        overlay.classList.toggle('visible', open);
      });
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      });
    })();
    </script>
'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html_module.escape(title)} — Fishing Arcade Game Docs</title>
  <link rel="stylesheet" href="styles.css">
  <script src="mermaid.min.js"></script>
</head>
<body>
  <div class="layout">
    <button class="sidebar-toggle" aria-label="Toggle navigation">☰</button>
    <div class="sidebar-overlay"></div>

    <aside class="sidebar" aria-label="Documentation navigation">
      <div class="sidebar-logo">
        <span class="logo-icon">🎣</span>
        <span class="logo-title">Fishing Arcade Game</span>
        <span class="logo-subtitle">Technical Documentation</span>
      </div>
      <nav class="sidebar-nav">
        {nav_html}
      </nav>
      <div class="sidebar-footer">
        v1.0 · TypeScript + Colyseus
      </div>
    </aside>

    <div class="main">
{page_header}
      <main class="content">
        {toc_html}
        {content_html}
      </main>
    </div>
  </div>
  {sidebar_toggle_js}
</body>
</html>'''


def build_index_page() -> str:
    """Build the index/home page."""
    cards = [
        ("brd.html", "BRD", "📋", "Business Requirements Document", "Goals, scope, monetisation strategy, and stakeholder requirements for the fishing arcade game.", "Core Doc"),
        ("edd.html", "EDD", "⚙️", "Engineering Design Document", "System architecture, technology choices, room lifecycle, RTP engine, and implementation plan.", "Core Doc"),
        ("api.html", "API Reference", "🔌", "WebSocket & REST API", "Complete API reference for all server messages, room commands, and REST endpoints.", "Reference"),
        ("arch.html", "Architecture", "🏗️", "System Architecture", "Component diagrams, deployment topology, data flow, and scalability considerations.", "Reference"),
        ("schema.html", "Database Schema", "🗄️", "Data Schema", "Full database schema — players, rooms, transactions, jackpot pool, audit logs.", "Reference"),
        ("test-plan.html", "Test Plan", "✅", "Quality Assurance", "Test strategy, unit/integration/E2E test cases, RTP validation, and performance benchmarks.", "QA"),
        ("diagrams.html", "Diagrams", "📊", "System Diagrams", "Sequence diagrams, state machines, and architecture diagrams in Mermaid format.", "Reference"),
        ("alignment.html", "Alignment Report", "🎯", "BRD–EDD Alignment", "Cross-document alignment analysis ensuring engineering design matches business requirements.", "Report"),
        ("smoke-test.html", "Smoke Test", "🔍", "Smoke Test Report", "Pre-release smoke test results covering critical paths and regression checks.", "Report"),
    ]

    cards_html = ''
    for (href, short_title, icon, long_title, desc, badge) in cards:
        cards_html += (
            f'<a href="{href}" class="doc-card">'
            f'<div class="card-icon">{icon}</div>'
            f'<div class="card-title">{html_module.escape(long_title)}</div>'
            f'<div class="card-desc">{html_module.escape(desc)}</div>'
            f'<span class="card-badge">{html_module.escape(badge)}</span>'
            f'</a>\n'
        )

    content_html = f'''
<div class="hero">
  <span class="hero-emoji">🎣</span>
  <h1>Fishing Arcade Game<br>Technical Documentation</h1>
  <p class="hero-desc">
    A multiplayer fishing arcade game for 4–6 players built with
    TypeScript, Node.js, Colyseus 0.15, and Cocos Creator 4.x.
    Designed for Asian markets (Taiwan, Southeast Asia) with real-time
    synchronisation, RTP-controlled fish scoring, and Jackpot mechanics.
  </p>
  <div class="hero-tags">
    <span class="hero-tag">TypeScript</span>
    <span class="hero-tag">Node.js</span>
    <span class="hero-tag">Colyseus 0.15</span>
    <span class="hero-tag">Cocos Creator 4.x</span>
    <span class="hero-tag">WebSocket</span>
    <span class="hero-tag">PostgreSQL</span>
  </div>
</div>

<div class="cards-section">
  <h2>Documentation</h2>
  <div class="cards-grid">
    {cards_html}
  </div>
</div>

<h2>Quick Overview</h2>
<p>
  This site contains the complete technical documentation generated during the
  <strong>devsop pipeline</strong> for the Fishing Arcade Game project.
  All documents are auto-generated from the <code>docs/</code> directory
  of the project repository.
</p>

<h3>Technology Stack</h3>
<ul>
  <li><strong>Client:</strong> Cocos Creator 4.x · TypeScript</li>
  <li><strong>Server:</strong> Node.js · Colyseus 0.15 · TypeScript</li>
  <li><strong>Database:</strong> SQLite (pilot) → PostgreSQL (scale)</li>
  <li><strong>Real-time:</strong> WebSocket (Colyseus room protocol)</li>
  <li><strong>Deployment:</strong> Docker · Kubernetes</li>
</ul>

<h3>Key Features</h3>
<ul>
  <li>4–6 player real-time rooms with Colyseus</li>
  <li>RTP-controlled fish scoring engine (85–95% configurable)</li>
  <li>Progressive Jackpot pool with shared contribution</li>
  <li>Multi-currency credit system</li>
  <li>PDPA-compliant player data handling</li>
  <li>Operator back-office API</li>
</ul>
'''
    return build_page("Home", content_html, "index.html")


def process_md_file(md_path: Path, html_filename: str, title: str) -> str:
    """Read a markdown file and return full HTML page string."""
    md_content = md_path.read_text(encoding='utf-8')
    content_html, headings = md_to_html(md_content)
    toc_html = build_toc(headings)
    return build_page(title, content_html, html_filename, toc_html)


def main() -> None:
    errors = []

    # Generate index
    index_html = build_index_page()
    (PAGES_DIR / "index.html").write_text(index_html, encoding='utf-8')
    print("✓ Generated index.html")

    # Generate doc pages
    for (html_file, title, md_file) in PAGES:
        if md_file is None:
            continue  # index already handled
        md_path = DOCS_DIR / md_file
        if not md_path.exists():
            print(f"⚠  Skipped {html_file} — source {md_file} not found", file=sys.stderr)
            continue
        try:
            page_html = process_md_file(md_path, html_file, title)
            (PAGES_DIR / html_file).write_text(page_html, encoding='utf-8')
            print(f"✓ Generated {html_file}")
        except Exception as exc:
            msg = f"✗ Error generating {html_file}: {exc}"
            print(msg, file=sys.stderr)
            errors.append(msg)

    if errors:
        print(f"\n{len(errors)} error(s) occurred during generation.", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\nAll pages generated successfully in {PAGES_DIR}")


if __name__ == "__main__":
    main()

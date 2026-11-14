"""Check repository Markdown links, fences and Chinese/English counterparts."""
from pathlib import Path
import re


def check(root: Path) -> list[str]:
    files = [root / 'README.md', root / 'AGENTS.md', root / 'AGENTS.en.md', *sorted((root / 'docs').glob('*.md'))]
    errors = []
    for file in files:
        if not file.is_file():
            errors.append(f'Missing document: {file.name}')
            continue
        body = file.read_text(encoding='utf-8')
        if '\ufffd' in body or body.count('```') % 2:
            errors.append(f'{file.name}: encoding/fence issue')
        if file.name != 'README.md' and not file.name.endswith('.en.md'):
            companion = file.with_name(file.stem + '.en.md')
            if not companion.is_file():
                errors.append(f'{file.name}: English companion missing')
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', body):
            if target.startswith(('https://', 'http://', 'mailto:')):
                continue
            path, _, anchor = target.partition('#')
            destination = (file.parent / path).resolve() if path else file
            if not destination.is_file():
                errors.append(f'{file.name}: missing {target}')
            elif anchor:
                headings = re.findall(r'^#{1,6}\s+(.+)$', destination.read_text(encoding='utf-8'), re.M)
                slugs = {re.sub(r'[^\w\- ]', '', h.lower()).replace(' ', '-') for h in headings}
                if anchor not in slugs:
                    errors.append(f'{file.name}: missing heading {target}')
    return errors


if __name__ == '__main__':
    issues = check(Path(__file__).resolve().parents[1])
    if issues:
        raise SystemExit('\n'.join(issues))
    print('PASS: Markdown local links, linked headings, fences, encoding and bilingual companions.')

export function selectInsights(items, search, sort, language = 'en') {
  const term = search.trim().toLocaleLowerCase(language);
  const filtered = term
    ? items.filter((item) => {
        const metadata = Object.values(item.metadata).flat().join(' ');
        return `${item.title} ${item.content} ${metadata}`
          .toLocaleLowerCase(language)
          .includes(term);
      })
    : [...items];
  if (sort !== 'original') {
    const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
    filtered.sort((a, b) => (sort === 'az' ? 1 : -1) * collator.compare(a.title, b.title));
  }
  return filtered;
}

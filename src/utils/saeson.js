export function getSaesonKontekst() {
  const now = new Date();
  const maaned = now.getMonth();
  const saeson =
    maaned >= 11 || maaned <= 1 ? "vinter"
    : maaned <= 4 ? "forår"
    : maaned <= 7 ? "sommer"
    : "efterår";
  const dato = now.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
  return `Det er ${dato}, ${saeson}sæson.`;
}

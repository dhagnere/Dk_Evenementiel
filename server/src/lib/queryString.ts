/**
 * Extrait une valeur de `req.query` en tant que chaîne simple, ou `undefined` si elle est absente OU
 * n'est pas une chaîne (ex. paramètre répété devenu tableau, ou syntaxe crochet type
 * `?champ[x]=y` que le parseur de requête d'Express transforme en objet). Les routes attendent un
 * texte simple, passé ensuite en paramètre SQL : un objet ou un tableau n'y a pas sa place.
 */
export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

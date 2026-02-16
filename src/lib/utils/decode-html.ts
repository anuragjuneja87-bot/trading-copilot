/**
 * Decode HTML entities in a string
 */
export function decodeHTMLEntities(text: string): string {
  if (!text) return '';
  
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
  };

  // Replace named and numeric entities
  let decoded = text;
  
  // Replace known entities
  Object.entries(entities).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });
  
  // Replace numeric entities (&#123; format)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  
  // Replace hex entities (&#x1F; format)
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

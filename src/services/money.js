// Montos en formato es-PY: miles con "." y decimales con ",".
//
// Antes se borraba todo lo que no fuera un dígito: "1500,50" se guardaba como
// 150050 y, al editar una operación con decimales (6705.38), el formulario la
// mostraba como "670.538" y al guardar quedaba multiplicada por 100.
//
// Regla: la coma es el separador decimal (máximo 2 decimales); los puntos son
// separadores de miles y se ignoran al leer. Los montos ya guardados no se
// tocan: sólo cambia cómo se muestran y cómo se lee lo que se escribe.

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const splitTyped = (raw) => {
  const s = String(raw).replace(/[^\d.,]/g, '');
  const comma = s.indexOf(',');
  if (comma === -1) return { int: s.replace(/\D/g, ''), dec: '', hasComma: false };
  return {
    int: s.slice(0, comma).replace(/\D/g, ''),
    dec: s.slice(comma + 1).replace(/\D/g, '').slice(0, 2),
    hasComma: true,
  };
};

// Para mostrar en un campo de texto. Acepta un número (valor guardado) o lo que
// el usuario va escribiendo (string), y respeta la coma decimal mientras se tipea.
export const formatMoney = (val) => {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    const [int, dec] = Math.abs(val).toFixed(2).split('.');
    const decTrim = dec.replace(/0+$/, '');
    return (val < 0 ? '-' : '') + groupThousands(int) + (decTrim ? ',' + decTrim : '');
  }
  const { int, dec, hasComma } = splitTyped(val);
  if (!int && !hasComma) return '';
  const intClean = int.replace(/^0+(?=\d)/, '') || '0';
  return groupThousands(intClean) + (hasComma ? ',' + dec : '');
};

// De lo que muestra el campo al número que se guarda.
export const parseMoney = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const { int, dec } = splitTyped(val);
  const n = Number(`${int || '0'}.${dec || '0'}`);
  return Number.isFinite(n) ? n : 0;
};

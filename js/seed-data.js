// Categories are fixed in code (simple for a family app). To add one, add a row here.
export const CATEGORIES = [
  { id: 'masala',      name: 'Masala Dabba',          gu: 'મસાલા ડબ્બો',          icon: '🌶️' },
  { id: 'grains_dals', name: 'Grains & Dals',         gu: 'અનાજ અને દાળ',         icon: '🌾' },
  { id: 'flours',      name: 'Flours / Atta',         gu: 'લોટ',                  icon: '🫓' },
  { id: 'oil_sweet',   name: 'Oil, Ghee & Sweet',     gu: 'તેલ, ઘી, ખાંડ-ગોળ',    icon: '🧈' },
  { id: 'misc',        name: 'Farsan & Dry Goods',    gu: 'ફરસાણ અને અન્ય',       icon: '🥜' },
];

// [name, Gujarati name, category, size, unit, extra search words]
const rows = [
  ['Turmeric (Haldar)',      'હળદર',          'masala', 500, 'g', ['haldi', 'haldar']],
  ['Red Chilli Powder',      'લાલ મરચું',      'masala', 500, 'g', ['marcha', 'mirch']],
  ['Dhana-Jeeru Powder',     'ધાણાજીરું',      'masala', 500, 'g', ['dhaniya', 'coriander']],
  ['Garam Masala',           'ગરમ મસાલો',     'masala', 200, 'g', []],
  ['Mustard Seeds (Rai)',    'રાઈ',            'masala', 500, 'g', ['rai', 'sarso']],
  ['Cumin Seeds (Jeeru)',    'જીરું',          'masala', 500, 'g', ['jeera']],
  ['Asafoetida (Hing)',      'હિંગ',           'masala', 100, 'g', ['hing']],
  ['Fenugreek Seeds (Methi)', 'મેથી દાણા',     'masala', 250, 'g', ['methi']],
  ['Carom Seeds (Ajwain)',   'અજમો',          'masala', 100, 'g', ['ajwain']],
  ['Chai Masala',            'ચા મસાલો',      'masala', 100, 'g', []],

  ['Rice',                   'ચોખા',           'grains_dals', 10, 'kg', ['chawal', 'basmati']],
  ['Toor Dal',               'તુવેર દાળ',      'grains_dals', 5,  'kg', ['tuver', 'arhar']],
  ['Moong Dal',              'મગની દાળ',      'grains_dals', 2,  'kg', ['mag']],
  ['Whole Moong (Mag)',      'આખા મગ',        'grains_dals', 2,  'kg', ['mag']],
  ['Chana Dal',              'ચણાની દાળ',     'grains_dals', 2,  'kg', []],
  ['Urad Dal',               'અડદની દાળ',     'grains_dals', 2,  'kg', ['adad']],
  ['Masoor Dal',             'મસૂર દાળ',      'grains_dals', 1,  'kg', []],
  ['Rajma',                  'રાજમા',          'grains_dals', 1,  'kg', []],
  ['Poha',                   'પૌવા',           'grains_dals', 2,  'kg', ['pauva']],
  ['Sabudana',               'સાબુદાણા',      'grains_dals', 1,  'kg', ['sago']],
  ['Rava (Sooji)',           'રવો',            'grains_dals', 1,  'kg', ['sooji', 'semolina']],

  ['Wheat Atta',             'ઘઉંનો લોટ',     'flours', 10, 'kg', ['gehu', 'aata', 'lot']],
  ['Besan',                  'ચણાનો લોટ',     'flours', 2,  'kg', ['gram flour']],
  ['Bajra Flour',            'બાજરીનો લોટ',   'flours', 2,  'kg', []],
  ['Jowar Flour',            'જુવારનો લોટ',   'flours', 2,  'kg', []],
  ['Rice Flour',             'ચોખાનો લોટ',    'flours', 1,  'kg', []],
  ['Maida',                  'મેંદો',          'flours', 1,  'kg', []],

  ['Cooking Oil',            'તેલ',            'oil_sweet', 5, 'l',  ['tel', 'oil']],
  ['Ghee',                   'ઘી',             'oil_sweet', 1, 'kg', []],
  ['Sugar',                  'ખાંડ',           'oil_sweet', 5, 'kg', ['khand', 'sakar']],
  ['Jaggery (Gol)',          'ગોળ',            'oil_sweet', 2, 'kg', ['gud', 'gol']],
  ['Salt',                   'મીઠું',          'oil_sweet', 1, 'kg', ['namak', 'mithu']],
  ['Tea Leaves',             'ચા',             'oil_sweet', 500, 'g', ['chai', 'chaa']],

  ['Papad',                  'પાપડ',          'misc', 500, 'g', []],
  ['Peanuts (Shing)',        'સીંગદાણા',      'misc', 2,   'kg', ['shing', 'moongfali']],
  ['Tamarind (Amli)',        'આમલી',          'misc', 500, 'g', ['imli']],
];

export const SEED_ITEMS = rows.map(([name, nameGu, category, sizeValue, sizeUnit, aliases]) => ({
  name, nameGu, category, sizeValue, sizeUnit, aliases, status: 'have',
}));

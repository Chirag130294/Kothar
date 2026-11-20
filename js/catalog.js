// catalog.js: dictionary (English -> Gujarati, category, packaging look, usual size), search, Gujarati phonetic fallback, thumbnails.
// Gujarati spellings are a starting point: every name stays editable in the app.
export const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9઀-૿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const FORMS = { shaker: 'Shaker', jar: 'Jar', sack: 'Sack', bottle: 'Bottle', tub: 'Tub', pouch: 'Pouch', box: 'Box' };
export const ART = {
  shaker: '<ellipse class="gnd" cx="32" cy="60.5" rx="17" ry="2.2"/><rect class="ag" x="15" y="20" width="34" height="39" rx="9"/><rect class="ct" x="17.2" y="28" width="29.6" height="29" rx="7"/><rect class="lbl" x="23" y="38" width="18" height="12" rx="2.5"/><rect class="lbln" x="26" y="41.5" width="12" height="2" rx="1"/><rect class="lbln" x="26" y="45" width="8" height="2" rx="1"/><rect class="hl" x="19.5" y="24" width="3.4" height="30" rx="1.7"/><rect class="sv2" x="21.5" y="15.5" width="21" height="6" rx="1.8"/><rect class="sv" x="19.5" y="5" width="25" height="12" rx="4"/><g class="hole"><circle cx="26" cy="11" r="1.3"/><circle cx="32" cy="11" r="1.3"/><circle cx="38" cy="11" r="1.3"/><circle cx="29" cy="14" r="1"/><circle cx="35" cy="14" r="1"/></g>',
  jar: '<ellipse class="gnd" cx="32" cy="60.5" rx="19" ry="2.2"/><rect class="ag" x="13" y="16" width="38" height="43" rx="10"/><rect class="ct" x="15.2" y="25" width="33.6" height="32" rx="8"/><g><circle class="s1" cx="22" cy="31" r="1.2"/><circle class="s2" cx="30" cy="29" r="1"/><circle class="s1" cx="41" cy="32" r="1.2"/><circle class="s2" cx="45" cy="42" r="1"/><circle class="s1" cx="19" cy="46" r="1.1"/><circle class="s2" cx="27" cy="54" r="1.1"/><circle class="s1" cx="38" cy="54" r="1.2"/><circle class="s2" cx="44" cy="52" r="1"/></g><rect class="lbl" x="21" y="35" width="22" height="14" rx="3"/><rect class="lbln" x="25" y="39" width="14" height="2" rx="1"/><rect class="lbln" x="25" y="43" width="9" height="2" rx="1"/><rect class="hl" x="18" y="21" width="3.4" height="33" rx="1.7"/><rect class="lid" x="16.5" y="7" width="31" height="11" rx="4"/>',
  sack: '<ellipse class="gnd" cx="32" cy="60.5" rx="21" ry="2.2"/><path class="sk" d="M13 22 Q32 15 51 22 L53.5 54 Q53.5 59.5 48 59.5 H16 Q10.5 59.5 10.5 54 Z"/><path class="sk2" d="M22 8.5 Q32 5 42 8.5 L47 20 Q32 25.5 17 20 Z"/><path class="tie" d="M18.5 20.5 Q32 26.5 45.5 20.5"/><rect class="lbl" x="19" y="31" width="26" height="22" rx="5"/><circle class="ct" cx="32" cy="39.5" r="5.5"/><rect class="lbln" x="25" y="47" width="14" height="2" rx="1"/>',
  bottle: '<ellipse class="gnd" cx="32" cy="60.5" rx="15" ry="2.2"/><rect class="lid" x="25" y="3.5" width="14" height="8" rx="2.5"/><rect class="ag" x="26.5" y="11" width="11" height="10"/><path class="ag" d="M21 31 Q21 21 28 20 H36 Q43 21 43 31 V54 Q43 59.5 38 59.5 H26 Q21 59.5 21 54 Z"/><path class="ct" d="M22.4 28.5 H41.6 V54 Q41.6 58 38 58 H26 Q22.4 58 22.4 54 Z"/><rect class="lbl" x="24" y="36" width="16" height="14" rx="2.5"/><rect class="lbln" x="27" y="40" width="10" height="2" rx="1"/><rect class="lbln" x="27" y="44" width="7" height="2" rx="1"/><rect class="hl" x="24.4" y="25" width="3" height="29" rx="1.5"/>',
  tub: '<ellipse class="gnd" cx="32" cy="60.5" rx="20" ry="2.2"/><path class="ag" d="M14 23 H50 L47.6 53 Q47.1 59.5 41 59.5 H23 Q16.9 59.5 16.4 53 Z"/><path class="ct" d="M15.1 26 H48.9 L46.8 52.5 Q46.4 57.5 41 57.5 H23 Q17.6 57.5 17.2 52.5 Z"/><rect class="lbl" x="21" y="33" width="22" height="15" rx="3"/><rect class="lbln" x="25" y="37.5" width="14" height="2" rx="1"/><rect class="lbln" x="25" y="42" width="9" height="2" rx="1"/><rect class="lid" x="11" y="13" width="42" height="11" rx="4.5"/>',
  pouch: '<ellipse class="gnd" cx="32" cy="60.5" rx="18" ry="2.2"/><path class="po" d="M13.5 11 H50.5 V53.5 Q50.5 59 45 59 H19 Q13.5 59 13.5 53.5 Z"/><rect class="crimp" x="13.5" y="11" width="37" height="6" rx="1.5"/><path d="M17 14h30" stroke="rgba(0,0,0,.2)" stroke-width="1" stroke-dasharray="2 2"/><rect class="ct" x="19" y="24" width="26" height="25" rx="5"/><rect class="lbl" x="23" y="31" width="18" height="11" rx="2.5"/><rect class="lbln" x="26" y="34.5" width="12" height="2" rx="1"/><rect class="lbln" x="26" y="38" width="7" height="2" rx="1"/>',
  box: '<ellipse class="gnd" cx="32" cy="60.5" rx="19" ry="2.2"/><rect class="bx" x="13" y="10" width="38" height="49" rx="6"/><rect class="band" x="13" y="10" width="38" height="9" rx="4"/><rect class="lbl" x="18.5" y="25" width="27" height="22" rx="4"/><circle class="ct" cx="32" cy="33" r="4.5"/><rect class="lbln" x="24" y="40" width="16" height="2" rx="1"/>',
};
export const art = (form, color) => `<svg class="art" viewBox="0 0 64 64" style="--c:${color}" aria-hidden="true">${ART[form] || ART.jar}</svg>`;
export const CATS = [
  { id: 'masala', name: 'Masala Dabba', gu: 'મસાલા ડબ્બો' },
  { id: 'grains', name: 'Grains & Dals', gu: 'અનાજ અને દાળ' },
  { id: 'flours', name: 'Flours', gu: 'લોટ' },
  { id: 'oil', name: 'Oil, Ghee & Sugar', gu: 'તેલ, ઘી, ખાંડ' },
  { id: 'dry', name: 'Dry Fruits & More', gu: 'સૂકો મેવો અને અન્ય' },
  { id: 'mixes', name: 'Mixes & Ready-made', gu: 'મિક્સ અને તૈયાર' },
];
export const DEFAULT_CATS = CATS.map((x) => ({ ...x }));
/** Replace the category list in place (shared settings). Bad input falls back to the defaults. */
export function setCats(list) {
  const ok = Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(x.id) && typeof x.name === 'string' && x.name.trim())
    .map((x) => ({ id: x.id, name: x.name.trim().slice(0, 40), gu: typeof x.gu === 'string' ? x.gu.trim().slice(0, 40) : '' })) : [];
  const seen = new Set(), uniq = ok.filter((x) => !seen.has(x.id) && seen.add(x.id));
  CATS.splice(0, CATS.length, ...(uniq.length ? uniq : DEFAULT_CATS.map((x) => ({ ...x }))));
}
export const RAW = [
  ['Turmeric (Haldar)', 'હળદર', 'masala', 'shaker', '#E8A317', 500, 'g', 'haldi|haldar|haddar'],
  ['Red Chilli Powder', 'લાલ મરચું', 'masala', 'shaker', '#C0261B', 500, 'g', 'mirch|marcha|marchu|lal marchu|chilli|chilli powder|chili powder|red chilli|lal mirch'],
  ['Coriander-Cumin Powder (Dhana Jeeru)', 'ધાણાજીરું', 'masala', 'shaker', '#B08D4F', 500, 'g', 'dhana jeeru|dhanajeeru|dhanajiru|dhana jiru|dhaniya'],
  ['Garam Masala', 'ગરમ મસાલો', 'masala', 'shaker', '#7A3E1D', 200, 'g', 'garamasala|garam masala|garm masala'],
  ['Mustard Seeds (Rai)', 'રાઈ', 'masala', 'shaker', '#3B2A20', 500, 'g', 'rai|sarso|mustard'],
  ['Cumin Seeds (Jeera)', 'જીરું', 'masala', 'shaker', '#8C7A4B', 500, 'g', 'jeera|jira|jiru|cumin'],
  ['Asafoetida (Hing)', 'હિંગ', 'masala', 'shaker', '#B8A06A', 100, 'g', 'hing'],
  ['Fenugreek Seeds (Methi)', 'મેથી દાણા', 'masala', 'shaker', '#C79A2E', 250, 'g', 'methi|fenugreek'],
  ['Carom Seeds (Ajwain)', 'અજમો', 'masala', 'shaker', '#8A7B4A', 100, 'g', 'ajwain|ajma'],
  ['Chai Masala', 'ચા મસાલો', 'masala', 'shaker', '#8B5A2B', 100, 'g', 'tea masala'],
  ['Chaat Masala', 'ચાટ મસાલો', 'masala', 'shaker', '#B5652B', 100, 'g', 'chat masala'],
  ['Black Pepper', 'મરી', 'masala', 'shaker', '#2E2A26', 100, 'g', 'mari|kali mirch|pepper'],
  ['Cloves', 'લવિંગ', 'masala', 'shaker', '#5A3622', 50, 'g', 'lavang|laung|clove'],
  ['Cardamom', 'એલચી', 'masala', 'shaker', '#7FA45A', 50, 'g', 'elaichi|elchi'],
  ['Cinnamon', 'તજ', 'masala', 'shaker', '#A0643A', 100, 'g', 'taj|dalchini'],
  ['Dry Ginger Powder', 'સૂંઠ', 'masala', 'shaker', '#C9A66B', 100, 'g', 'sunth|sonth|saunth'],
  ['Salt', 'મીઠું', 'masala', 'shaker', '#F1EFE8', 1, 'kg', 'mithu|namak'],
  ['Rice (Basmati)', 'ચોખા', 'grains', 'sack', '#EFE6CF', 10, 'kg', 'chawal|chokha|chokha|rice'],
  ['Toor Dal', 'તુવેર દાળ', 'grains', 'jar', '#E3B23C', 5, 'kg', 'tuver|tuvar|arhar|tur dal'],
  ['Moong Dal', 'મગની દાળ', 'grains', 'jar', '#E8C94F', 2, 'kg', 'mag dal|magni dal|moong'],
  ['Whole Moong', 'આખા મગ', 'grains', 'jar', '#6E8F3A', 2, 'kg', 'mug|mag|green moong|aakha mag'],
  ['Chana Dal', 'ચણાની દાળ', 'grains', 'jar', '#D9A441', 2, 'kg', 'chana|chanani dal'],
  ['Urad Dal', 'અડદની દાળ', 'grains', 'jar', '#E6DCC0', 2, 'kg', 'adad|urad|adadni dal'],
  ['Masoor Dal', 'મસૂર દાળ', 'grains', 'jar', '#D9742B', 1, 'kg', 'masur|red lentil'],
  ['Rajma', 'રાજમા', 'grains', 'jar', '#8E2F2A', 1, 'kg', 'kidney beans'],
  ['Kabuli Chana', 'કાબુલી ચણા', 'grains', 'jar', '#D8BE8A', 1, 'kg', 'kabuli|chickpeas'],
  ['Black Chana', 'કાળા ચણા', 'grains', 'jar', '#4A3426', 1, 'kg', 'kala chana|kaala chana'],
  ['Poha', 'પૌંઆ', 'grains', 'jar', '#EBD98A', 2, 'kg', 'pauva|pova|flattened rice'],
  ['Sabudana', 'સાબુદાણા', 'grains', 'jar', '#F1EEE4', 1, 'kg', 'sago|sabu dana'],
  ['Rava (Sooji)', 'રવો', 'grains', 'jar', '#EBD9A8', 1, 'kg', 'rava|sooji|suji|semolina'],
  ['Peanuts', 'સીંગદાણા', 'grains', 'jar', '#C58A4B', 2, 'kg', 'shing|singdana|moongfali|groundnut'],
  ['Wheat Atta', 'ઘઉંનો લોટ', 'flours', 'sack', '#D9BE8A', 10, 'kg', 'gehu|ghau|aata|atta|lot|wheat flour'],
  ['Besan', 'ચણાનો લોટ', 'flours', 'sack', '#E5C45A', 2, 'kg', 'gram flour|chana flour'],
  ['Bajra Flour', 'બાજરીનો લોટ', 'flours', 'sack', '#9A8F7A', 2, 'kg', 'bajri|bajra'],
  ['Jowar Flour', 'જુવારનો લોટ', 'flours', 'sack', '#D9CBA8', 2, 'kg', 'juwar|jowar'],
  ['Rice Flour', 'ચોખાનો લોટ', 'flours', 'sack', '#F2EEE3', 1, 'kg', 'chokha lot'],
  ['Maida', 'મેંદો', 'flours', 'sack', '#F5F1E6', 1, 'kg', 'mendo|all purpose flour'],
  ['Cooking Oil', 'તેલ', 'oil', 'bottle', '#E3B53B', 5, 'l', 'tel|oil'],
  ['Groundnut Oil', 'સીંગતેલ', 'oil', 'bottle', '#DDA52B', 5, 'l', 'shing tel|singtel|peanut oil'],
  ['Ghee', 'ઘી', 'oil', 'tub', '#F0C94A', 1, 'kg', 'ghi|clarified butter'],
  ['Sugar', 'ખાંડ', 'oil', 'pouch', '#F7F6F0', 5, 'kg', 'khand|sakar|shakkar'],
  ['Jaggery', 'ગોળ', 'oil', 'tub', '#A4602A', 2, 'kg', 'gol|gud'],
  ['Tea Leaves', 'ચા', 'oil', 'box', '#5B3A22', 500, 'g', 'chai|chaa|tea'],
  ['Honey', 'મધ', 'oil', 'bottle', '#D99A1E', 500, 'g', 'madh'],
  ['Papad', 'પાપડ', 'dry', 'box', '#D9B77A', 500, 'g', ''],
  ['Tamarind', 'આમલી', 'dry', 'pouch', '#7A4A2B', 500, 'g', 'amli|imli'],
  ['Almonds', 'બદામ', 'dry', 'jar', '#B98550', 500, 'g', 'badam'],
  ['Cashews', 'કાજુ', 'dry', 'jar', '#E4C58E', 500, 'g', 'kaju'],
  ['Raisins', 'કિસમિસ', 'dry', 'jar', '#6B3E26', 500, 'g', 'kismis|draksh'],
  ['Dates', 'ખજૂર', 'dry', 'box', '#5A3220', 500, 'g', 'khajur'],
  ['Sesame Seeds (Tal)', 'તલ', 'masala', 'shaker', '#E6D6A8', 500, 'g', 'tal|til'],
  ['Makhana', 'મખાના', 'dry', 'pouch', '#F1ECDD', 250, 'g', 'fox nut|lotus seeds|phool makhana'],
  ['Yellow Peas (Vatana)', 'વટાણા', 'grains', 'jar', '#E3C65A', 2, 'kg', 'vatana|vatan|dried peas|yellow peas'],
  ['Whole Chana (Sabut)', 'આખા ચણા', 'grains', 'jar', '#B68A55', 2, 'kg', 'mosabi chana|mosambi chana|sabut chana|aakha chana'],
  ['Bhakhri Flour', 'ભાખરીનો લોટ', 'flours', 'sack', '#CDB27A', 4, 'kg', 'bhakhri lot|bhakri lot|bhalhri lot|bhakhri atta'],
  ['Sona Masoori Rice', 'સોના મસૂરી ચોખા', 'grains', 'sack', '#EDE4CC', 10, 'kg', 'sona masuri|sona masoori|masoori rice'],
  ['Idli Rice', 'ઇડલી ચોખા', 'grains', 'sack', '#EFE9D8', 10, 'kg', 'idli chawal'],
  ['Kashmiri Chilli Powder', 'કાશ્મીરી મરચું', 'masala', 'shaker', '#B3261E', 500, 'g', 'kashmiri|kashmiri mirch|kashmiri chili'],
  ['Ganthoda Powder', 'ગંઠોડા પાવડર', 'masala', 'shaker', '#9C7B54', 100, 'g', 'ganthoda|gantholi|ganthora'],
  ['Amchoor (Mango Powder)', 'આમચૂર', 'masala', 'shaker', '#B89B5E', 200, 'g', 'amchur|amchoor|mango powder'],
  ['Khichiya Papad', 'ખીચિયા પાપડ', 'dry', 'box', '#E0C48A', 500, 'g', 'khichiya|khichia|khichu papad'],
  ['Handvo Mix', 'હાંડવો મિક્સ', 'mixes', 'box', '#D7A24A', 500, 'g', 'handva|handvo|talod handva|talod handvo'],
  ['Dhokla Mix', 'ઢોકળા મિક્સ', 'mixes', 'box', '#E2C14B', 500, 'g', 'dhokla|talod dhokla'],
  ['Pav Bhaji Masala', 'પાવભાજી મસાલો', 'mixes', 'box', '#C0392B', 100, 'g', 'pav bhaji|pavbhaji'],
  ['Kitchen King Masala', 'કિચન કિંગ મસાલો', 'mixes', 'box', '#B5532B', 100, 'g', 'kitchen king'],
  ['Jaljira Masala', 'જલજીરા', 'mixes', 'box', '#6E8F3A', 100, 'g', 'jaljira|jal jeera|jaljeera'],
  ['Sabji Masala', 'શાક મસાલો', 'mixes', 'box', '#A8442B', 100, 'g', 'sabji|sabzi masala|shak masala'],
  ['Chole Masala', 'છોલે મસાલો', 'mixes', 'box', '#7A3E1D', 100, 'g', 'chhole masala|chole|chhole'],
  ['Pani Puri Masala', 'પાણીપુરી મસાલો', 'mixes', 'box', '#7FA45A', 100, 'g', 'pani puri|panipuri|golgappa'],
  ['Buttermilk Masala', 'છાશ મસાલો', 'mixes', 'box', '#C9A66B', 100, 'g', 'butter milk|buttermilk|chhash masala|chaas masala'],
  ['Pickle (Achar)', 'અથાણું', 'mixes', 'jar', '#C46A1B', 1, 'kg', 'achar|athanu|pickle'],
];
export const ENTRIES = RAW.map(([en, gu, cat, form, color, size, unit, al]) => {
  const base = norm(en.replace(/\(.*?\)/g, ''));
  const par = (en.match(/\((.*?)\)/) || [])[1];
  const keys = [...new Set([norm(en), base, par ? norm(par) : '', ...al.split('|').map(norm)].filter(Boolean))];
  return { en, gu, cat, form, color, size, unit, keys };
});
export function lookup(q) {
  q = norm(q); if (q.length < 2) return [];
  const out = [];
  for (const e of ENTRIES) {
    let best = 0;
    for (const k of e.keys) {
      let s = 0;
      if (k === q) s = 100;
      else if (k.startsWith(q)) s = (k.length - q.length <= 3) ? 85 : 66;
      else if (q.length >= 3 && k.split(' ').some((w) => w.startsWith(q))) s = 70;
      else if (q.split(' ').every((w) => k.split(' ').includes(w))) s = 75;
      else if (k.split(' ').every((w) => q.split(' ').includes(w))) s = 70;
      else if (q.length >= 4 && k.includes(q)) s = 45;
      else if (k.length >= 4 && q.startsWith(k)) s = 60;
      best = Math.max(best, s);
    }
    if (best) out.push({ e, s: best });
  }
  return out.sort((a, b) => b.s - a.s || a.e.en.localeCompare(b.e.en));
}
export const GLOSS = { dal: 'દાળ', flour: 'લોટ', powder: 'પાવડર', seeds: 'દાણા', seed: 'દાણા', oil: 'તેલ', rice: 'ચોખા', red: 'લાલ', black: 'કાળા', white: 'સફેદ', green: 'લીલા', whole: 'આખા', masala: 'મસાલો', salt: 'મીઠું', sugar: 'ખાંડ', tea: 'ચા', chana: 'ચણા', moong: 'મગ', urad: 'અડદ', toor: 'તુવેર', masoor: 'મસૂર', wheat: 'ઘઉં', atta: 'લોટ', ghee: 'ઘી', jaggery: 'ગોળ', peanut: 'સીંગદાણા', peanuts: 'સીંગદાણા', coconut: 'નાળિયેર', pepper: 'મરી', chilli: 'મરચું', chili: 'મરચું', cumin: 'જીરું', turmeric: 'હળદર', coriander: 'ધાણા', ginger: 'આદુ', garlic: 'લસણ', dry: 'સૂકા', roasted: 'શેકેલા', small: 'નાના', big: 'મોટા' };
export const VOW = [['aa', 'આ', 'ા'], ['ee', 'ઈ', 'ી'], ['ii', 'ઈ', 'ી'], ['oo', 'ઊ', 'ૂ'], ['uu', 'ઊ', 'ૂ'], ['ai', 'ઐ', 'ૈ'], ['au', 'ઔ', 'ૌ'], ['ou', 'ઔ', 'ૌ'], ['a', 'અ', ''], ['i', 'ઇ', 'િ'], ['u', 'ઉ', 'ુ'], ['e', 'એ', 'ે'], ['o', 'ઓ', 'ો']];
export const CON = [['chh', 'છ'], ['ch', 'ચ'], ['kh', 'ખ'], ['gh', 'ઘ'], ['jh', 'ઝ'], ['Th', 'ઠ'], ['Dh', 'ઢ'], ['th', 'થ'], ['dh', 'ધ'], ['ph', 'ફ'], ['bh', 'ભ'], ['sh', 'શ'], ['k', 'ક'], ['g', 'ગ'], ['j', 'જ'], ['T', 'ટ'], ['D', 'ડ'], ['N', 'ણ'], ['L', 'ળ'], ['t', 'ત'], ['d', 'દ'], ['n', 'ન'], ['p', 'પ'], ['f', 'ફ'], ['b', 'બ'], ['m', 'મ'], ['y', 'ય'], ['r', 'ર'], ['l', 'લ'], ['v', 'વ'], ['w', 'વ'], ['s', 'સ'], ['h', 'હ'], ['z', 'ઝ'], ['c', 'ક'], ['q', 'ક'], ['x', 'ક્સ']];
export function phon(word) {
  let w = word.replace(/[^A-Za-z]/g, '');
  if (!w) return '';
  w = w[0].toLowerCase() + w.slice(1).replace(/[A-Z]/g, (c, i, s) => ('TDNL'.includes(c) ? c : c.toLowerCase()));
  const toks = [];
  for (let i = 0; i < w.length;) {
    const v = VOW.find(([k]) => w.startsWith(k, i));
    if (v) { toks.push({ v }); i += v[0].length; continue; }
    const c = CON.find(([k]) => w.startsWith(k, i));
    if (c) { toks.push({ c: c[1] }); i += c[0].length; continue; }
    i++;
  }
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], nx = toks[i + 1];
    if (t.v) out += t.v[1];
    else if (nx && nx.v) { out += t.c + nx.v[2]; i++; }
    else if (nx && nx.c) out += t.c + '્';
    else out += t.c;
  }
  return out;
}
export function toGu(text) {
  const base = text.replace(/\(.*?\)/g, ' ').trim();
  if (!base) return '';
  return base.split(/\s+/).map((w) => GLOSS[w.toLowerCase()] || phon(w)).join(' ');
}
export function guessCat(n) {
  n = norm(n);
  if (/powder|masala|seed|spice|pepper|clove|cardamom|salt|jeera|haldi|mirch/.test(n)) return 'masala';
  if (/flour|atta|lot|besan|maida/.test(n)) return 'flours';
  if (/oil|ghee|sugar|tea|honey|jaggery|gol/.test(n)) return 'oil';
  if (/nut|almond|cashew|raisin|date|papad|dry/.test(n)) return 'dry';
  return 'grains';
}
export const PALETTE = ['#E8A317', '#C0261B', '#8C7A4B', '#7A3E1D', '#6E8F3A', '#D9742B', '#B08D4F', '#5B3A22'];
export const KEYCOL = [[/turmeric|haldi/, '#E8A317'], [/chil|mirch|marcha|red/, '#C0261B'], [/green|moong|methi|cardamom|mint/, '#6E8F3A'], [/black|pepper|mustard|\brai\b/, '#3B2A20'], [/rice|flour|maida|salt|sugar|sabudana|white/, '#EFE9D8'], [/oil|ghee|honey|corn/, '#E9B63A'], [/jaggery|\bgol\b|gud|tea|chai/, '#8B5A2B']];
export function toKg(s, u) { return u === 'kg' || u === 'l' ? s : s / 1000; }
export function guessLook(name, cat, size, unit) {
  const n = norm(name);
  let form = cat === 'masala' ? 'shaker' : cat === 'flours' ? 'sack' : cat === 'dry' ? 'box'
    : cat === 'oil' ? (/ghee|butter|ghi/.test(n) ? 'tub' : (unit === 'l' || unit === 'ml' || /oil|honey|syrup/.test(n)) ? 'bottle' : 'pouch')
    : (toKg(size, unit) >= 5 ? 'sack' : 'jar');
  const hit = KEYCOL.find(([re]) => re.test(n));
  let hs = 0; for (const ch of n) hs = (hs * 31 + ch.charCodeAt(0)) >>> 0;
  return { form, color: hit ? hit[1] : PALETTE[hs % PALETTE.length] };
}
export const catName = (id) => (CATS.find((c) => c.id === id) || CATS[CATS.length - 1]).name;
export const catGu = (id) => (CATS.find((c) => c.id === id) || CATS[CATS.length - 1]).gu;
/** Which category does a section heading in a pasted list ("Box", "Masala") point at? */
export function catFromHeading(text) {
  const n = norm(text);
  if (!n) return null;
  if (/^box$|mix|ready/.test(n)) return 'mixes';
  if (/masala|spice|dabba/.test(n)) return 'masala';
  if (/flour|lot|atta/.test(n)) return 'flours';
  if (/oil|ghee|sugar/.test(n)) return 'oil';
  if (/dry fruit|nuts/.test(n)) return 'dry';
  if (/dal|grain|rice|anaj/.test(n)) return 'grains';
  return null;
}

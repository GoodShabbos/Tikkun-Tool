import test from 'ava'
import { wordPairs } from './word-pairs.ts'

test('simple words pair 1:1', (t) => {
  t.deepEqual(wordPairs('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים'), [
    { plain: 'בראשית', annotated: 'בְּרֵאשִׁ֖ית' },
    { plain: 'ברא', annotated: 'בָּרָ֣א' },
    { plain: 'אלהים', annotated: 'אֱלֹהִ֑ים' },
  ])
})

test('maqaf splits into separate plain words', (t) => {
  // Raw: עַל־פְּנֵ֣י → annotated: עַל־פְּנֵ֣י, plain: על פני
  t.deepEqual(wordPairs('עַל־פְּנֵ֣י'), [
    { plain: 'על', annotated: 'עַל' },
    { plain: 'פני', annotated: 'פְּנֵ֣י' },
  ])
})

test('multiple maqaf words in a line', (t) => {
  // Raw: וּבְכָל־הָרֶ֛מֶשׂ עַל־הָאָ֖רֶץ
  t.deepEqual(wordPairs('וּבְכָל־הָרֶ֛מֶשׂ עַל־הָאָ֖רֶץ'), [
    { plain: 'ובכל', annotated: 'וּבְכָל' },
    { plain: 'הרמש', annotated: 'הָרֶ֛מֶשׂ' },
    { plain: 'על', annotated: 'עַל' },
    { plain: 'הארץ', annotated: 'הָאָ֖רֶץ' },
  ])
})

test('ktiv/kri 1:1 — plain word gets annotated kri form', (t) => {
  // Raw: הוצא#[הַיְצֵ֣א] → annotated: {הַיְצֵ֣א}, plain: הוצא
  // After stripping {}, annotated becomes: הַיְצֵ֣א
  t.deepEqual(wordPairs('הוצא#[הַיְצֵ֣א] אִתָּ֑ךְ'), [
    { plain: 'הוצא', annotated: 'הַיְצֵ֣א' },
    { plain: 'אתך', annotated: 'אִתָּ֑ךְ' },
  ])
})

test('ktiv/kri 1→2 — one plain word maps to multi-word annotated', (t) => {
  // Raw: אשדת#[אֵ֥שׁ דָּ֖ת] לָֽמוֹ׃ → annotated: {אֵ֥שׁ דָּ֖ת} לָֽמוֹ׃, plain: אשדת למו
  // After stripping {}, annotated: אֵ֥שׁ דָּ֖ת לָֽמוֹ׃ (3 words)
  // Plain has 2 words, annotated has 3 — can't cleanly split, fall back to grouping
  // Each plain word gets the full annotated text (clicking reveals everything)
  const pairs = wordPairs('אשדת#[אֵ֥שׁ דָּ֖ת] לָֽמוֹ׃')
  t.is(pairs[0].plain, 'אשדת')
  t.is(pairs[0].annotated, 'אֵ֥שׁ דָּ֖ת לָֽמוֹ׃')
  t.is(pairs[1].plain, 'למו')
  t.is(pairs[1].annotated, 'אֵ֥שׁ דָּ֖ת לָֽמוֹ׃')
})

test('maqaf with ktiv/kri combined', (t) => {
  // Raw: לך#[לכה-]נא → annotated: {לכה-}נא, plain: לך נא
  // After stripping {}, annotated: לכה־נא (maqaf-joined)
  // Split annotated on ־: לכה, נא
  // Plain split on space: לך, נא
  t.deepEqual(wordPairs('לך#[לכה-]נא'), [
    { plain: 'לך', annotated: 'לכה' },
    { plain: 'נא', annotated: 'נא' },
  ])
})

test('maqaf with ktiv/kri — וְאֶת־בנו#[בָּנָ֖יו]', (t) => {
  // Raw: וְאֶת־בנו#[בָּנָ֖יו] → annotated: וְאֶת־{בָּנָ֖יו}, plain: ואת בנו
  // After stripping {}, annotated: וְאֶת־בָּנָ֖יו
  // Split annotated on ־: וְאֶת, בָּנָ֖יו
  // Plain split on space: ואת, בנו
  t.deepEqual(wordPairs('וְאֶת־בנו#[בָּנָ֖יו]'), [
    { plain: 'ואת', annotated: 'וְאֶת' },
    { plain: 'בנו', annotated: 'בָּנָ֖יו' },
  ])
})

test('nun-hafucha is preserved', (t) => {
  // Raw: אַלְפֵ֥י יִשְׂרָאֵֽל׃#(׆) → annotated: אַלְפֵ֥י יִשְׂרָאֵֽל׃ ׆, plain: אלפי ישראל ׆
  const pairs = wordPairs('אַלְפֵ֥י יִשְׂרָאֵֽל׃#(׆)')
  t.is(pairs[0].plain, 'אלפי')
  t.is(pairs[0].annotated, 'אַלְפֵ֥י')
  t.is(pairs[1].plain, 'ישראל')
  t.is(pairs[1].annotated, 'יִשְׂרָאֵֽל׃')
  t.is(pairs[2].plain, '׆')
  t.is(pairs[2].annotated, '׆')
})

test('petucha marker is removed', (t) => {
  // Raw: וַֽיְהִי־בֹ֖קֶר י֥וֹם אֶחָֽד׃#(פ)
  // annotated: וַֽיְהִי־בֹ֖קֶר י֥וֹם אֶחָֽד׃, plain: ויהי ערב ויהי בקר יום הששי
  // Wait, this specific raw text doesn't have ערב. Let me use the actual test data.
  // Raw: וַֽיְהִי־עֶ֥רֶב וַֽיְהִי־בֹ֖קֶר י֥וֹם הַשִּׁשִּֽׁי׃#(פ)
  const pairs = wordPairs(
    'וַֽיְהִי־עֶ֥רֶב וַֽיְהִי־בֹ֖קֶר י֥וֹם הַשִּׁשִּֽׁי׃#(פ)'
  )
  t.is(pairs[0].plain, 'ויהי')
  t.is(pairs[0].annotated, 'וַֽיְהִי')
  t.is(pairs[1].plain, 'ערב')
  t.is(pairs[1].annotated, 'עֶ֥רֶב')
  t.is(pairs[2].plain, 'ויהי')
  t.is(pairs[2].annotated, 'וַֽיְהִי')
  t.is(pairs[3].plain, 'בקר')
  t.is(pairs[3].annotated, 'בֹ֖קֶר')
  t.is(pairs[4].plain, 'יום')
  t.is(pairs[4].annotated, 'י֥וֹם')
  t.is(pairs[5].plain, 'הששי')
  t.is(pairs[5].annotated, 'הַשִּׁשִּֽׁי׃')
})

test('multiple ktiv/kri on same line', (t) => {
  const pairs = wordPairs(
    'הָעַמִּ֑ים וְלִהְי֨וֹת היהודיים#[הַיְּהוּדִ֤ים] עתודים#[עֲתִידִים֙] לַיּ֣וֹם הַזֶּ֔ה לְהִנָּקֵ֖ם'
  )
  t.is(pairs[0].plain, 'העמים')
  t.is(pairs[0].annotated, 'הָעַמִּ֑ים')
  t.is(pairs[1].plain, 'ולהיות')
  t.is(pairs[1].annotated, 'וְלִהְי֨וֹת')
  // היהודיים#[הַיְּהוּדִ֤ים] — kri has 1 word, ketiv has 1 word → 1:1
  t.is(pairs[2].plain, 'היהודיים')
  t.is(pairs[2].annotated, 'הַיְּהוּדִ֤ים')
  // עתודים#[עֲתִידִים֙] — kri has 1 word, ketiv has 1 word → 1:1
  t.is(pairs[3].plain, 'עתודים')
  t.is(pairs[3].annotated, 'עֲתִידִים֙')
  t.is(pairs[4].plain, 'ליום')
  t.is(pairs[4].annotated, 'לַיּ֣וֹם')
  t.is(pairs[5].plain, 'הזה')
  t.is(pairs[5].annotated, 'הַזֶּ֔ה')
  t.is(pairs[6].plain, 'להנקם')
  t.is(pairs[6].annotated, 'לְהִנָּקֵ֖ם')
})

test('empty fragment returns empty array', (t) => {
  t.deepEqual(wordPairs(''), [])
})
import test from 'ava'
import maskHolyNames, { countHolyNames } from './holy-name.ts'

/* === Tetragrammaton === */

test('unpointed tetragrammaton → ה׳', (t) => {
  t.is(maskHolyNames('ויעש נח ככל אשר־צוהו יהוה'), 'ויעש נח ככל אשר־צוהו ה׳')
})

test('pointed tetragrammaton (sheva + holem-vav + kamatz) → ה׳', (t) => {
  t.is(
    maskHolyNames('וַיַּ֖עַשׂ נֹ֑חַ כְּכֹ֥ל אֲשֶׁר־צִוָּ֖הוּ יְהֹוָֽה׃'),
    'וַיַּ֖עַשׂ נֹ֑חַ כְּכֹ֥ל אֲשֶׁר־צִוָּ֖הוּ ה׳׃'
  )
})

test('prefixed lamed form לַיהֹוָה → לַה׳', (t) => {
  t.is(
    maskHolyNames('מִ֥י לַיהֹוָ֖ה אֵלָ֑י'),
    'מִ֥י לַה׳ אֵלָ֑י'
  )
})

test('name followed by maqaf keeps the maqaf', (t) => {
  t.is(maskHolyNames('בְּעֵינֵ֥י יְהֹוָה־'), 'בְּעֵינֵ֥י ה׳־')
})

test('multiple occurrences in one line', (t) => {
  t.is(
    maskHolyNames('יְהֹוָה אֶת־יְהֹוָה'),
    'ה׳ אֶת־ה׳'
  )
})

/* === אלהי family === */

test('אֱלֹהִים → אֱ-לֹקִים', (t) => {
  t.is(maskHolyNames('בָּרָ֣א אֱלֹהִ֑ים'), 'בָּרָ֣א אֱ-לֹקִ֑ים')
})

test('אֱלֹהֵי (construct) → אֱ-לֹקֵי', (t) => {
  t.is(
    maskHolyNames('בָּר֥וּךְ יְהֹוָ֖ה אֱלֹ֣הֵי שֵׁ֑ם'),
    'בָּר֥וּךְ ה׳ אֱ-לֹ֣קֵי שֵׁ֑ם'
  )
})

test('אֱלֹהֶיךָ (suffix) → אֱ-לֹקֶיךָ', (t) => {
  t.is(
    maskHolyNames('יְהֹוָה־אֱלֹהֶ֖יךָ'),
    'ה׳־אֱ-לֹקֶ֖יךָ'
  )
})

test('stem-hey marks carry onto the kuf', (t) => {
  // hiriq + dehi mark under the hey must end up under the kuf
  t.is(
    maskHolyNames('אֱלֹהִ֑ים'),
    'אֱ-לֹקִ֑ים'
  )
})

/* === False positives must NOT match === */

test('וַיְהִי is not the tetragrammaton', (t) => {
  t.is(maskHolyNames('וַיְהִי־בֹ֖קֶר'), 'וַיְהִי־בֹ֖קֶר')
})

test('bare אל / אֵל / אֶל untouched', (t) => {
  t.is(maskHolyNames('אל אֵל אֶל־'), 'אל אֵל אֶל־')
})

test('הִוא / אֹתוֹ untouched (no יהוה letter run)', (t) => {
  t.is(maskHolyNames('חַטָּ֖את הִֽוא׃'), 'חַטָּ֖את הִֽוא׃')
})

test('טהור / מיהוא-like letter runs untouched', (t) => {
  // י-ה-ו sequences inside ordinary words must not trigger.
  t.is(maskHolyNames('טָהוֹר יִהְיֶה'), 'טָהוֹר יִהְיֶה')
})

/* === Layout invariance contract === */

test('masking never inserts or removes spaces', (t) => {
  const input = 'וַיַּ֣עַשׂ אֱלֹהִים֮ אֶת־הָרָקִ֒יעַ֒ וַיַּבְדֵּ֗ל'
  const output = maskHolyNames(input)
  t.is(output.split(' ').length, input.split(' ').length)
})

test('masking never changes word boundaries (maqaf preserved)', (t) => {
  const input = 'יְהֹוָה־אֱלֹהֶ֖יךָ נֹתֵ֨ן'
  const output = maskHolyNames(input)
  // What remains after masking (maqaf + spaces — the layout skeleton) must
  // be identical. Strip everything else via codepoints: Hebrew letters,
  // combining marks, geresh (05F3) and ASCII hyphen. Built from explicit
  // escapes so no combining sequences appear inside a character class.
  const LETTERS = '[\\u05D0-\\u05EA]'
  const MARKS = '[\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4-\\u05C7]'
  const EXTRA = '[\\u05F3\\u002D]'
  const skeleton = new RegExp(`${LETTERS}|${MARKS}|${EXTRA}`, 'g')
  const stripped = (s) => s.replace(skeleton, '')
  t.is(stripped(output), stripped(input))
})

test('idempotent: masking twice equals masking once', (t) => {
  const input = 'בָּר֥וּךְ יְהֹוָ֖ה אֱלֹ֣הֵי שֵׁ֑ם'
  t.is(
    maskHolyNames(maskHolyNames(input)),
    'בָּר֥וּךְ ה׳ אֱ-לֹ֣קֵי שֵׁ֑ם'
  )
})

/* === Counting === */

test('countHolyNames counts both forms', (t) => {
  t.is(countHolyNames('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים'), 1)
  t.is(countHolyNames('צִוָּ֥ה יְהֹוָ֛ה לַעֲשׂ֖וֹת'), 1)
  t.is(countHolyNames('יְהֹוָה־אֱלֹהֶ֖יךָ'), 2)
  t.is(countHolyNames('וַיְהִי אוֹר'), 0)
})
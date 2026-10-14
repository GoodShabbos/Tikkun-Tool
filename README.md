# Tikkun Tool

> The most advanced online tikkun - Remix of tikkun.io

# *Features:*

## Click to show vowels/trop:
<img width="1658" height="120" alt="image" src="https://github.com/user-attachments/assets/1320cbdc-3750-4375-8f85-2cec29905d14" />

Clicking on any word shows the vowels and trop, useful so you dont have to show the entire coloum in vowels.


The source text is pulled from the [Sefaria API](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation), with some minor overrides as issues are found (such as פתוחה/סתומה discrepancies).

## Contributing

**Dependencies**: Node.js 10+

Fork, clone, `npm install`.

> **Note:** See [DEVELOPMENT.md](DEVELOPMENT.md) for the branching workflow — commit to `dev`; only merge to `production` once `dev` is stable.

Start the development process by running `npm run dev`. This will watch for file changes as you edit and start a local server on port 8000 where you can play with and test your changes. Just visit http://localhost:8000 in your browser.

Run unit tests with `npm test`, and watch for changes to automatically run the tests with `npm run test:watch`.

Run the UI tests with `npm run test:ui`.

Pull requests are welcome!

For bug fixes, kindly submit a failing test case that now passes as a result of the fix. For new features, submit test cases as well, which will improve the likelihood that the pull request will be merged. If you cannot write the test cases for whatever reason, add that as a note in the pull request so that we can discuss alternatives.

## License

[MIT](LICENSE)

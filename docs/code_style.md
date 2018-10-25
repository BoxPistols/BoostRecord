# Boostnote Code Style
When submitting your PR, please make sure that your code is well tested and follow the code style of Boostnote.

The code style of Boostnote is listed in [`.eslintrc`](.eslintrc). We also have additional code styles that is not mentioned in that file.

## Additional code styles
### Use ES6 Object Destructing

Please use Object Destructing whenever it's possible.

**Example**: Importing from library

```js

// BAD
import Code from 'library'
const subCode = Code.subCode
subCode()

// GOOD
import { subCode } from 'library'
subCode()
```

**Example**: Extract data from react component state

```
// BAD
<h1>{this.state.name}</h1>

// GOOD
const { name } = this.state
<h1>{name}</h1>
```

### Use meaningful name
This is actually not a "code style" but rather a requirement in every projects. Please name your variables carefully.

**Example**: Naming callback function for event

```js
// BAD
<h1 onclick={onClick}>Name</h1>

// GOOD
<h1 onclick={onNameClick}>Name</h1>
```

### Don't write long conditional statement
When writing a conditional statement, if it's too long, cut it into small meaningful variables.

```js
// BAD
if (note.type == 'markdown' && note.index == 2 && note.content.indexOf('string') != -1)

// GOOD
const isSecondMarkdownNote = note.type == 'markdown' && note.index == 2
const isNoteHasString = note.content.indexOf('string') != -1
if (isSecondMarkdownNote && isNoteHasString)
```

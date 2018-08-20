/**
 * @fileoverview Unit test for browser/lib/markdown-toc-generator
 */
const test = require('ava')
const markdownToc = require('browser/lib/markdown-toc-generator')
const EOL = require('os').EOL

test(t => {
  /**
   * @testCases Contains array of test cases in format :
   *  [
   *     test title
   *     input markdown,
   *     expected output markdown with toc
   *  ]
   *
   */
  const testCases = [
    [
      '***************************** empty note',
      `  
    `,
      ` 
<!-- toc -->



<!-- tocstop -->
    `
    ],
    [
      '***************************** single level',
      `
# one
    `,
      `
<!-- toc -->

- [one](#one)

<!-- tocstop -->

# one
    `
    ],
    [
      '***************************** two levels',
      `
# one
# two    
    `,
      `
<!-- toc -->

- [one](#one)
- [two](#two)

<!-- tocstop -->

# one
# two    
    `
    ],
    [
      '***************************** 3 levels with children',
      `
# one
## one one
# two
## two two
# three
## three three
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)
- [two](#two)
  * [two two](#two-two)
- [three](#three)
  * [three three](#three-three)

<!-- tocstop -->

# one
## one one
# two
## two two
# three
## three three
    `
    ],
    [
      '***************************** 3 levels, 3rd with 6 sub-levels',
      `
# one
## one one
# two
## two two
# three
## three three
### three three three
#### three three three three
##### three three three three three
###### three three three three three three
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)
- [two](#two)
  * [two two](#two-two)
- [three](#three)
  * [three three](#three-three)
    + [three three three](#three-three-three)
      - [three three three three](#three-three-three-three)
        * [three three three three three](#three-three-three-three-three)
          + [three three three three three three](#three-three-three-three-three-three)

<!-- tocstop -->

# one
## one one
# two
## two two
# three
## three three
### three three three
#### three three three three
##### three three three three three
###### three three three three three three
    `
    ],
    [
      '***************************** multilevel with texts in between',
      `
# one
this is a level one text
this is a level one text
## one one
# two
  this is a level two text
  this is a level two text
## two two
  this is a level two two text
  this is a level two two text
# three
  this is a level three three text
  this is a level three three text
## three three
  this is a text
  this is a text
### three three three
  this is a text
  this is a text
### three three three 2
  this is a text
  this is a text
#### three three three three
  this is a text
  this is a text
#### three three three three 2
  this is a text
  this is a text
##### three three three three three
  this is a text
  this is a text
##### three three three three three 2
  this is a text
  this is a text
###### three three three three three three
  this is a text
  this is a text
  this is a text      
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)
- [two](#two)
  * [two two](#two-two)
- [three](#three)
  * [three three](#three-three)
    + [three three three](#three-three-three)
    + [three three three 2](#three-three-three-2)
      - [three three three three](#three-three-three-three)
      - [three three three three 2](#three-three-three-three-2)
        * [three three three three three](#three-three-three-three-three)
        * [three three three three three 2](#three-three-three-three-three-2)
          + [three three three three three three](#three-three-three-three-three-three)

<!-- tocstop -->

# one
this is a level one text
this is a level one text
## one one
# two
  this is a level two text
  this is a level two text
## two two
  this is a level two two text
  this is a level two two text
# three
  this is a level three three text
  this is a level three three text
## three three
  this is a text
  this is a text
### three three three
  this is a text
  this is a text
### three three three 2
  this is a text
  this is a text
#### three three three three
  this is a text
  this is a text
#### three three three three 2
  this is a text
  this is a text
##### three three three three three
  this is a text
  this is a text
##### three three three three three 2
  this is a text
  this is a text
###### three three three three three three
  this is a text
  this is a text
  this is a text
    `
    ],
    [
      '***************************** already generated toc',
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)
- [two](#two)
  * [two two](#two-two)
- [three](#three)
  * [three three](#three-three)
    + [three three three](#three-three-three)
      - [three three three three](#three-three-three-three)
        * [three three three three three](#three-three-three-three-three)
          + [three three three three three three](#three-three-three-three-three-three)

<!-- tocstop -->

# one
## one one
# two
## two two
# three
## three three
### three three three
#### three three three three
##### three three three three three
###### three three three three three three      
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)
- [two](#two)
  * [two two](#two-two)
- [three](#three)
  * [three three](#three-three)
    + [three three three](#three-three-three)
      - [three three three three](#three-three-three-three)
        * [three three three three three](#three-three-three-three-three)
          + [three three three three three three](#three-three-three-three-three-three)

<!-- tocstop -->

# one
## one one
# two
## two two
# three
## three three
### three three three
#### three three three three
##### three three three three three
###### three three three three three three            
    `
    ],
    [
      '***************************** note with just an opening TOC marker',
      `
<!-- toc -->


# one
## one one
      
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)

<!-- tocstop -->

# one
## one one
    `
    ],
    [
      '***************************** note with just a closing TOC marker',
      `
<!-- tocstop -->

# one
## one one     
    `,
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)

<!-- tocstop -->

# one
## one one
      
    `
    ],

    [
      '***************************** outdated TOC',
      `
<!-- toc -->

- [one](#one)
  * [one one](#one-one)

<!-- tocstop -->

# one modified
## one one
      
    `,
      `
<!-- toc -->

- [one modified](#one-modified)
  * [one one](#one-one)

<!-- tocstop -->

# one modified
## one one      
    `
    ],
    [
      '***************************** properly generated case sensitive TOC',
      `
# onE 
## oNe one
    `,
      `
<!-- toc -->

- [onE](#onE)
  * [oNe one](#oNe-one)

<!-- tocstop -->

# onE 
## oNe one      
    `
    ],
    [
      '***************************** position of TOC is stable (do not use elements above toc marker)',
      `
# title

this is a text

<!-- toc -->

- [onE](#onE)
  * [oNe one](#oNe-one)

<!-- tocstop -->

# onE 
## oNe one      
    `,
      `
# title

this is a text

<!-- toc -->

- [onE](#onE)
  * [oNe one](#oNe-one)

<!-- tocstop -->

# onE 
## oNe one      
    `
    ],
    [
      '***************************** properly handle generation of not completed TOC',
      `
# hoge

##     
    `,
      `
<!-- toc -->

- [hoge](#hoge)

<!-- tocstop -->

# hoge

##      
    `
    ]
  ]

  testCases.forEach(testCase => {
    const title = testCase[0]
    const inputMd = testCase[1].trim()
    const expectedOutput = testCase[2].trim()
    let generatedOutput
    markdownToc.generate(inputMd, (o) => { generatedOutput = o.trim() })
    t.is(generatedOutput, expectedOutput, `Test ${title} , generated : ${EOL}${generatedOutput}, expected : ${EOL}${expectedOutput}`)
  })
})

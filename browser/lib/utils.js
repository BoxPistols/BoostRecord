export function lastFindInArray (array, callback) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (callback(array[i], i, array)) {
      return array[i]
    }
  }
}

export default {
  lastFindInArray
}

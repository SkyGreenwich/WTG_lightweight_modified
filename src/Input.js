// Input Script - WTG Lightweight Modified
// Derivative of WTG 2.0 by thedenial. - Apache 2.0 - See LICENSE

// Every script needs a modifier function
const modifier = (text) => {
  text = onInput_WTG(text);

  return { text }
}

// Don't modify this part
modifier(text)

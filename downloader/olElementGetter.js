const { findAll } = require('domutils');

const getCorrectOlElement = (title, doc) => {
  const olElements = findAll(el => el.name === 'ol', doc.children);
  let selectedOls = [...olElements];

  if (title === 'CLASSROOM OF THE ELITE' || title === 'The Eminence in Shadow' || title === 'The Game Master has Logged In to Another World'
      || title === 'My Stepsister is My Ex-Girlfriend' || title === 'I Surrendered My Sword for a New Life as a Mage'
      || title === 'Saving 80,000 Gold in Another World for my Retirement' || title === 'Gimai Seikatsu' || title === 'Our Dating Story: The Experienced You and The Inexperienced Me'
      || title === 'The Neighboring Aarya-san who Sometimes Acts Affectionate and Murmuring in Russian' || title === 'Knights & Magic') {
    if (selectedOls.length > 0) {
      selectedOls.pop();
    }
  } 
  else if (title === 'Date A Live' || title === 'Liar, Liar' || title === 'Strongest Gamer Let’s Play in Another World'
      || title === 'Senka no Maihime' || title === 'Redefining the META at VRMMO Academy' || title === 'Ascendance of a Bookworm: Royal Academy Stories – First Year'
      || title === 'The Girl Raised by the Death God Holds the Sword of Darkness in Her Arms' || title === 'I Got A Cheat Ability In A Different World, And Become Extraordinary Even In The Real World'
      || title === 'The World of Otome Games is Tough For Mobs' || title === 'Disowned but Not Disheartened! Life Is Good with Overpowered Magic' 
      || title === 'Eiyuu Kyoushitsu') {
    if (selectedOls.length > 0) {
      selectedOls.shift();
    }
  } 
  else if (title === 'Unlimited Fafnir') {
    if (selectedOls.length > 0) {
      selectedOls.splice(1, 1);
    }
  }
  else if (title === 'Rakudai Kishi no Eiyuutan') {
    if (selectedOls.length > 0) {
      selectedOls.shift();
      selectedOls.pop();
    }
  } 
  else if (title === 'High School DxD') {
    if (selectedOls.length > 0) {
      selectedOls.shift();
      selectedOls.shift();
    }
  }

  return {
    title,
    ols: selectedOls
  };
};

module.exports = { getCorrectOlElement };
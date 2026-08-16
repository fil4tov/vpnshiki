const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*+-=?';
const CHARACTER_GROUPS = [LOWERCASE, UPPERCASE, DIGITS, SYMBOLS];
const ALL_CHARACTERS = CHARACTER_GROUPS.join('');

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

export function generatePassword(length = 16) {
  const password = CHARACTER_GROUPS.map((group) => group[randomIndex(group.length)]);

  while (password.length < Math.max(length, CHARACTER_GROUPS.length)) {
    password.push(ALL_CHARACTERS[randomIndex(ALL_CHARACTERS.length)]);
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join('');
}

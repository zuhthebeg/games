import { STAT_KEYS } from './stats.js';

const option = (text, w, a) => ({ text, w, a });
export const FAMILIES = ['blade', 'bow', 'focus'];
export const WEAPON_NAMES = { blade: '검', bow: '활', focus: '지팡이' };
export const QUESTIONS = [
  {
    text: '숲에서 괴물이 수레를 막았다면?',
    options: [
      option('앞에 서서 길을 뚫는다.', [3, 0, 0], [4, 1, 0, 0, 0]),
      option('뒤로 돌아 빈틈을 찾는다.', [0, 3, 0], [0, 4, 1, 0, 0]),
      option('괴물이 두려워할 빛을 찾는다.', [0, 0, 3], [0, 0, 4, 1, 0]),
      option('수레 주인과 힘을 합친다.', [1, 1, 1], [0, 0, 0, 2, 3]),
    ],
  },
  {
    text: '어둠 속에서 동료가 다쳤다면?',
    options: [
      option('동료를 업고 안전한 곳으로 간다.', [3, 0, 0], [4, 0, 0, 1, 0]),
      option('먼저 달려가 길을 확보한다.', [0, 3, 0], [0, 4, 0, 1, 0]),
      option('풀의 성질을 살펴 치료한다.', [0, 0, 3], [0, 0, 3, 2, 0]),
      option('침착하게 붕대를 감는다.', [1, 1, 1], [0, 0, 0, 3, 2]),
    ],
  },
  {
    text: '소리가 나는 폐허에 보물이 있다면?',
    options: [
      option('문을 열고 위험과 마주한다.', [3, 0, 0], [4, 1, 0, 0, 0]),
      option('창으로 들어가 퇴로를 찾는다.', [0, 3, 0], [0, 4, 0, 1, 0]),
      option('문양을 읽어 잠금을 푼다.', [0, 0, 3], [0, 0, 4, 1, 0]),
      option('약속을 정하고 함께 들어간다.', [1, 1, 1], [0, 0, 1, 1, 3]),
    ],
  },
  {
    text: '여관의 마지막 불씨를 지킬 것은?',
    options: [
      option('밤새 패 온 장작 더미.', [3, 0, 0], [4, 0, 0, 1, 0]),
      option('숨겨진 샘으로 가는 지도.', [0, 3, 0], [0, 3, 1, 1, 0]),
      option('불을 지키는 작은 문양.', [0, 0, 3], [0, 0, 3, 2, 0]),
      option('모두를 부르는 이야기.', [1, 1, 1], [0, 0, 0, 2, 3]),
    ],
  },
  {
    text: '처음 쥐고 싶은 무기는?',
    options: [
      option('차갑고 단단한 검.', [12, 0, 0], [3, 1, 0, 1, 0]),
      option('팽팽한 시위의 활.', [0, 12, 0], [0, 3, 1, 1, 0]),
      option('은은히 빛나는 지팡이.', [0, 0, 12], [0, 0, 3, 2, 0]),
      option('동료를 지킬 넓은 검.', [12, 0, 0], [1, 0, 0, 2, 2]),
    ],
  },
];

export function resolve(answers) {
  if (answers.length !== 5 || answers.some((answer) => !Number.isInteger(answer) || answer < 0 || answer > 3)) {
    throw new Error('문답 다섯 개를 모두 선택하세요.');
  }
  const weaponScores = [0, 0, 0];
  const statScores = [0, 0, 0, 0, 0];
  answers.forEach((answer, index) => {
    const selected = QUESTIONS[index].options[answer];
    selected.w.forEach((score, key) => weaponScores[key] += score);
    selected.a.forEach((score, key) => statScores[key] += score);
  });
  const attraction = QUESTIONS[4].options[answers[4]].w;
  const q5Weapon = attraction.indexOf(Math.max(...attraction));
  const maxWeaponScore = Math.max(...weaponScores);
  const weaponIndex = weaponScores[q5Weapon] === maxWeaponScore ? q5Weapon : weaponScores.indexOf(maxWeaponScore);
  const total = statScores.reduce((sum, score) => sum + score, 0);
  const quotas = statScores.map((score) => score * 6 / total);
  const points = quotas.map((quota) => Math.min(3, Math.floor(quota)));
  const ranking = quotas.map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  let remaining = 6 - points.reduce((sum, value) => sum + value, 0);
  // Redistribute capped quotas in remainder order, skipping full stats.
  while (remaining > 0) {
    for (const { index } of ranking) {
      if (remaining > 0 && points[index] < 3) {
        points[index]++;
        remaining--;
      }
    }
  }
  return {
    weapon: FAMILIES[weaponIndex],
    points: Object.fromEntries(STAT_KEYS.map((key, index) => [key, points[index]])),
    weaponScores,
    statScores,
  };
}

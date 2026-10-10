import { STAT_KEYS } from './stats.js';

const option = (text, w, a) => ({ text, w, a });
export const FAMILIES = ['blade', 'bow', 'focus'];
export const WEAPON_NAMES = { blade: '검', bow: '활', focus: '지팡이' };
export const QUESTIONS = [
  {
    text: '낯선 숲에서 수레를 가로막은 작은 괴물과 마주쳤다. 당신은?',
    options: [
      option('수레 앞에 서서 길을 뚫는다.', [3, 0, 0], [4, 1, 0, 0, 0]),
      option('나무 뒤로 돌아 빈틈을 찾는다.', [0, 3, 0], [0, 4, 1, 0, 0]),
      option('괴물이 두려워하는 빛을 찾아본다.', [0, 0, 3], [0, 0, 4, 1, 0]),
      option('수레 주인과 힘을 합칠 방법을 정한다.', [1, 1, 1], [0, 0, 0, 2, 3]),
    ],
  },
  {
    text: '함께 온 여행자가 다쳤다. 어둠이 가까워지고 있다.',
    options: [
      option('여행자를 업고 안전한 곳까지 간다.', [3, 0, 0], [4, 0, 0, 1, 0]),
      option('먼저 달려가 돌아올 길을 확보한다.', [0, 3, 0], [0, 4, 0, 1, 0]),
      option('낯선 풀의 성질을 살펴 치료한다.', [0, 0, 3], [0, 0, 3, 2, 0]),
      option('눈을 맞추고 침착하게 붕대를 감는다.', [1, 1, 1], [0, 0, 0, 3, 2]),
    ],
  },
  {
    text: '폐허의 문틈으로 보물이 보인다. 안쪽에서 소리가 난다.',
    options: [
      option('문을 밀어 열고 위험과 마주한다.', [3, 0, 0], [4, 1, 0, 0, 0]),
      option('작은 창으로 들어가 빠져나올 틈을 찾는다.', [0, 3, 0], [0, 4, 0, 1, 0]),
      option('벽의 문양을 읽어 잠금을 해제한다.', [0, 0, 3], [0, 0, 4, 1, 0]),
      option('탐험자들과 약속을 정하고 함께 들어간다.', [1, 1, 1], [0, 0, 1, 1, 3]),
    ],
  },
  {
    text: '여관의 마지막 불씨가 꺼지려 한다. 당신이 남길 것은?',
    options: [
      option('밤새 패 온 장작 더미.', [3, 0, 0], [4, 0, 0, 1, 0]),
      option('아무도 몰랐던 샘으로 가는 지도.', [0, 3, 0], [0, 3, 1, 1, 0]),
      option('불을 지키는 작은 문양.', [0, 0, 3], [0, 0, 3, 2, 0]),
      option('모두를 난로 곁으로 부르는 이야기.', [1, 1, 1], [0, 0, 0, 2, 3]),
    ],
  },
  {
    text: '처음 손에 쥐고 싶은 것',
    options: [
      option('단단한 손잡이, 차가운 검날.', [12, 0, 0], [3, 1, 0, 1, 0]),
      option('팽팽한 시위와 가벼운 화살.', [0, 12, 0], [0, 3, 1, 1, 0]),
      option('손끝에서 은은히 빛나는 지팡이.', [0, 0, 12], [0, 0, 3, 2, 0]),
      option('누군가를 지키기 위한 넓은 검.', [12, 0, 0], [1, 0, 0, 2, 2]),
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

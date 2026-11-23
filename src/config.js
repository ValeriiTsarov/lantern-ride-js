// Усі числа механіки — тут, під назвами з GDD §14. Назви в коді й у GDD збігаються.
export const C = {
  // §3 простір
  VIEW_H: 720, MIN_W: 360,
  ROAD_HALF: 140, SIDEWALK_HALF: 180,
  // §4.1 керування
  JOY_RADIUS: 60, JOY_DEADZONE: 0.15,
  KEY_VX: 380, KEY_VY: 200,
  BIKE_VX_MAX: 520, BIKE_VY_MAX: 300,
  // плавність: вісь керування розганяється за STEER_RESP/с, велосипед має інерцію (BIKE_K — пружина до цілі, BIKE_ACC — прискорення)
  WISP_ON_ROAD: 0.4,
  STEER_RESP: 7, BIKE_K: 7, BIKE_ACC: 2600,
  BIKE_R: 14, BIKE_START_Y: 180,
  // повороти: дорога повертає, а велосипед за інерцією їде прямо — у поворот гравець входить сам.
  // TURN_PUSH — сила відносу назовні, TURN_GRIP — як швидко (1/с) велосипед сам вирівнюється з дорогою
  TURN_PUSH: 1.3, TURN_GRIP: 0.8,
  PHI_MAX: 0.8,         // найбільший кут курсу велосипеда до дороги, рад
  // звивистість дороги (раніше — графічне налаштування roadCurve/roadWave, але вона змінює складність поворотів)
  ROAD_CURVE: 1.5, ROAD_WAVE: 1.5,
  // §4.2 швидкість
  Y_SLOW: 100, Y_FAST: 460,
  V_MIN: 120, V_MAX: 240,
  // §4.3 фара на кермі: конус світла попереду; привид у конусі за BURN_T зникає
  AIM_MAX: 0.55, VX_SWING: 300,
  SPRING: 60, DAMP: 9,
  HEAD_Y: 18, BEAM_HALF: 0.42,
  // скільки світити на привида, щоб він згорів: від BURN_T_MIN (рівень 1) до BURN_T_MAX (рівень 13), крива BURN_POW
  BURN_T_MIN: 0.4, BURN_T_MAX: 3.0, BURN_POW: 1.4,
  BURN_DECAY: 0.5,     // поза променем «нагрів» привида спадає вдвічі повільніше, ніж росте
  WISP_HOLD: 1.0,      // привид у промені завмирає відносно велосипеда: відступає разом із ним (частка швидкості велосипеда)
  // §4.4 заряд батарейки ліхтарика (у коді — oil, назви як у GDD); батарейки на дорозі — колишні каністри
  OIL_DRAIN: 2.2, OIL_PICKUP: 18,
  OIL_EVERY: 1300, OIL_JITTER: 320,
  BEAM_MIN: 150, BEAM_MAX: 360,      // довжина променя від порожньої до повної батарейки
  FLICKER_BELOW: 25, FLICKER_AMP: 0.08, FLICKER_HZ: 6,
  HIT_WISP: 20, HIT_SHADE: 30,
  HIT_OBSTACLE: 25,     // удар у перешкоду знімає заряд (раніше — одразу поразка)
  OBSTACLE_KNOCK: 140,  // після удару велосипед відкидає вниз екрана (сповільнення)
  INVULN_AFTER: 0.5,
  // §4.5 ракета
  FLARE_T: 5, FLARE_DY: 260, FLARE_DX: 100,
  // §6.1 Вогник
  WISP_V: 90, WISP_V_FRONT: 170, WISP_V_BACK_FRAC: 0.6, // позаду привид женеться швидше за повільний велосипед: тікати — розганятися
  WISP_TURN: 2.0, // попереду велосипеда привиди підлітають швидше
 
  WISP_LIFE: 6, WISP_MAX: 5, WISP_COINS: 3, WISP_R: 16,
  // де з'являються Вогники: на дорозі — на ROAD_Y0 + rng·ROAD_DY попереду; з поля — на FIELD_X за краєм MIN_W, FIELD_Y0 + rng·FIELD_DY попереду
  WISP_ROAD_Y0: 320, WISP_ROAD_DY: 220, WISP_FIELD_X: 60, WISP_FIELD_Y0: 80, WISP_FIELD_DY: 420,
  I_START: 2.4, I_END: 1.2,
  // §5.1 частота Вогників за кількістю засвічених будинків
  SEG_MULT: [1.0, 0.9, 0.8, 0.7],
  // §6.2 Тінь
  SHADE_V_FRAC: 0.65,
  SHADE_AT: [[], [0.5], [0.5], [0.35, 0.7]],
  SHADE_WARN_T: 1.5, SHADE_ESCAPE: 120, SHADE_COINS: 10,
  // §5.1 будинки
  SAFE_AFTER_CP: 400, GATE_CLEAR: 200,
  CP_T: 0.5, SLOWMO_K: 0.4, SLOWMO_T: 0.5,
  // §5.2 генерація
  MIN_GAP: 70,
  COIN_LINE: 5, COIN_STEP: 40,
  COIN_R: 10, CAN_R: 14,
  // §5.1′ Проселкова дорога: одна основна траса, рідкі розвилки, що повертаються на неї.
  // Будинки стоять при дорозі (чекпойнти); останній — дім, рівень пройдено.
  // wisp — множник інтервалу появи Вогників (менше — частіше)
  ROUTES: [
    { len: 12000, houses: 3, forks: 1, wisp: 1.0 },
    { len: 15000, houses: 4, forks: 2, wisp: 1.0 },
    { len: 18000, houses: 5, forks: 2, wisp: 1.0 },
    { len: 18000, houses: 5, forks: 2, wisp: 0.95 },
    { len: 19000, houses: 5, forks: 3, wisp: 0.92 },
    { len: 20000, houses: 5, forks: 3, wisp: 0.9 },
    { len: 21000, houses: 6, forks: 3, wisp: 0.88 },
    { len: 22000, houses: 6, forks: 3, wisp: 0.86 },
    { len: 23000, houses: 6, forks: 4, wisp: 0.84 },
    { len: 24000, houses: 6, forks: 4, wisp: 0.82 },
    { len: 25000, houses: 7, forks: 4, wisp: 0.8 },
    { len: 26000, houses: 7, forks: 4, wisp: 0.78 },
    { len: 28000, houses: 7, forks: 5, wisp: 0.75 },
  ],
  FORK_LEN: 2600,       // від розгалуження до злиття
  FORK_RAMP: 900,       // відгалуження відходить убік на цій довжині
  FORK_OFF: 440,        // наскільки далеко збоку йде відгалуження
  FORK_MARGIN: 500,     // від будинку до розвилки
  DECIDE_GAP: 60,       // вибір дороги — за стільки до розгалуження
  FORK_HINT: 600,       // підказка про першу розвилку — за стільки до неї
  LANE_T: 50,           // |x| > LANE_T у бік відгалуження — їдемо на нього
  // §9
  COIN_STAR_FRAC: 0.9,  // ★2 — частка монет на вулицях рівня
  // §13 магазин: ціни скінів у монетах (монети забігу йдуть у гаманець після рівня або виходу)
  BIKE_PRICES: { tangerine: 0, mint: 100, lemon: 200, bubblegum: 300, ghost: 450, midnight: 650, spooky: 900 },
  HERO_PRICES: { skaterMaleA: 0, skaterFemaleA: 0, criminalMaleA: 250, cyborgFemaleA: 500, skaterMint: 400, skaterViolet: 650, criminalGold: 900, cyborgNeon: 1200 },
  // §11
  HITSTOP_MS: 60, SHAKE_MS: 120,
  // §15
  SIM_DT: 1 / 120,
  FRAME_DT_MAX: 0.05,   // довший кадр обрізаємо: після підвисання гра не «перестрибує» вперед
  SIM_STEPS_MAX: 4,     // не більше кроків симуляції за кадр (захист від «спіралі смерті»); 4 × 1/120 ≈ 33 мс, нижче 30 fps гра сповільнюється
};

C.WISP_V_BACK = C.V_MIN + C.WISP_V_BACK_FRAC * (C.V_MAX - C.V_MIN);
C.SHADE_V = C.V_MIN + C.SHADE_V_FRAC * (C.V_MAX - C.V_MIN);
C.LEVELS = C.ROUTES.length;

/**
  The main game logic
    Owns the game scenes and switches between them
*/
import { UI } from './ui.js';
import { STORAGE_KEYS } from './constants.js';

export class Game {
  /**
   *
   * @param {Object} params
   * @param {UI} params.ui UI instance
   * @param {Map} params.assetsMap map of assets
   */
  constructor({ ui, assetsMap }) {
    this.assets = assetsMap;
    this.ui = ui;
    this.currentScene = null;

    this.scenesMap = new Map();
    for (let SceneClass of [
      SplashScene, ChoicesScene, GameOverScene, AchievementsScene
    ]) {
      const scene = new SceneClass(this);
      this.scenesMap.set(scene.id, scene);
    }
  }

  async start() {
    await this.ui.initialize();
    // start at the first scene we registered
    await this.switchScene(Array.from(this.scenesMap.keys())[0]);
  }

  async switchScene(id, params = {}) {
    const scene = this.scenesMap.get(id);
    if (this.currentScene === scene) {
      return;
    }
    if (this.currentScene) {
      await this.currentScene.exit();
    }
    this.currentScene = scene;
    await this.currentScene.enter(params);
  }

  /**
   * Saves data to local storage
   * @param {Object} saveData data to save
   * @param {string} storageName item name in local storage to save to
   */
  saveToLocal(saveData, name) {
    localStorage.setItem(name, JSON.stringify(saveData));
  }

  /**
   * Fetches data from local storage
   * @param {string} storageName item name in local storage to get
   */
  retrieveFromLocal(name) {
    let jsonData = localStorage.getItem(name) || '{}';
    return JSON.parse(jsonData);
  }
}

class _Scene {
  /**
   *
   * @param {Game} game the game instance the scene belongs to
   */
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.assets = game.assets;
  }
  async enter(param) {
    //console.assert(false, 'Not implemented');
    // Backgrounds
    this.backgroundNames = this.assets.get('backgrounds');
  }
  async exit(param) {
    console.assert(false, 'Not implemented');
  }

  /**
   * Sets the background for the scene
   * @param {string} passageName the name of the passage
   * @param {Object} outcome the outcome of the passage
   */
  setBackground(passageName, outcome) {
    if (!outcome.type) {
      this.ui
        .updateBackground(this.backgroundNames.get('default'))
        .then(() => {});
      return;
    }
    if (this.backgroundNames.has(passageName)) {
      this.ui.updateBackground(this.backgroundNames.get(passageName));
    } else if (this.backgroundNames.has(outcome.tag)) {
      this.ui.updateBackground(this.backgroundNames.get(outcome.tag));
    } else {
      this.ui.updateBackground(this.backgroundNames.get('default'));
    }
  }
}

class ChoicesScene extends _Scene {
  id = 'prompts';

  /**
   *
   * @param {Object} params - the parameter object
   * @param {string} params.startType - the start type that defines what node to start with
   */
  async enter({ startType }) {
    super.enter();
    console.log(`entering ${this.id} scene`);
    this.outcomes = {};
    // Twine/Story Data
    this.twineData = this.assets.get('stories');
    console.log('Game start, with data:', this.twineData);
    // Save Data
    this.saveData = new Map();
    this.saveData.set('endings', this.assets.get('endings'));

    let startPid =
      startType == 'alt'
        ? this.twineData.altstartnode
        : this.twineData.startnode;

    let promiseEntered = this.ui.enterScene(this.id);
    await promiseEntered;
    const result = await this.handleChoice(startPid);
    if (result) {
      document.addEventListener('user-choice', this);
    }
  }

  async exit() {
    console.log(`exiting ${this.id} scene`);
    document.removeEventListener('user-choice', this);
    await this.ui.exitScene('prompts');
  }

  /**
   *
   * @param {Event} event Event from ui to handle
   */
  handleEvent(event) {
    if (event.type == 'user-choice') {
      console.log('Got user choice:', event.detail);
      this.handleChoice(parseInt(event.detail.id));
    }
  }

  /**
   * Handle a passage choice event
   * @param {number} pid
   */
  async handleChoice(pid) {
    // Process id starts at 1, convert to 0 indexing
    let currentPassage = this.twineData.passages[pid - 1];
    let passageName = currentPassage.name;
    // Get outcome tag
    let outcome = this.countOutcome(currentPassage.tags) || {};

    // handle endings switching to game over scene and early-return
    if (outcome.type == 'END') {
      return this.handleEnd(currentPassage, outcome);
    }
    // handle Menu (right now does nothing)
    if (outcome.type == 'MENU') {
      return;
    }

    this.setBackground(passageName, outcome);
    this.ui.updateBackgroundAudio();

    // handle normal paths
    this.handleNormalPath(passageName);

    // update prompt and wording
    this.ui.updatePrompt(currentPassage.text.split('[[')[0]);
    this.ui.updateWordChoices(currentPassage.links);
    return true;
  }

  /**
   * Finds and counts the outcome of a passage based on it's tags
   * @param {Array} tags a list of tags for the passage
   * @returns {Object{tag: string, type: string} | null} the matching outcome
   */
  countOutcome(tags) {
    if (tags.includes('BAD-END')) {
      this.outcomes.bad += 1;
      return { tag: 'BAD-END', type: 'END' };
    } else if (tags.includes('Good-End')) {
      this.outcomes.goodEnd += 1;
      return { tag: 'Good-End', type: 'END' };
    } else if (tags.includes('Neutral-End')) {
      this.outcomes.neutralEnd += 1;
      return { tag: 'Neutral-End', type: 'END' };
    } else if (tags.includes('Neutral-Path')) {
      this.outcomes.neutral += 1;
      return { tag: 'Neutral-Path', type: 'PATH' };
    } else if (tags.includes('GOOD')) {
      this.outcomes.good += 1;
      return { tag: 'GOOD', type: 'PATH' };
    } else if (tags.includes('EGG')) {
      this.outcomes.egg += 1;
      return { tag: 'EGG', type: 'END' };
    } else if (tags.includes('Menu-page')) {
      return { tag: 'Menu-page', type: 'MENU' };
    }

    return null;
  }

  /**
   * Handles end passage and switching to a gameover scene
   * @param {Object} currentPassage the current passage data
   * @param {Object{tag: string, type: string} | null} outcome the outcome data
   */
  async handleEnd(currentPassage, outcome) {
    let passageText = currentPassage.text.split('[[')[0];
    let passageName = currentPassage.name;

    // track ending in saveData
    if (this.saveData.get('endings').hasOwnProperty(passageName)) {
      this.saveData.get('endings')[passageName]['got'] = true;
    } else {
      console.log('Ending not being tracked for: ', passageName);
    }
    console.log('Endings: ', this.saveData.get('endings'));
    this.game.saveToLocal(this.saveData.get('endings'), STORAGE_KEYS.ENDINGS);

    // switch to game over scene
    await this.game.switchScene('gameover', {
      outcome: outcome,
      ending: passageText,
      passageName: passageName,
    });
    return false; // let the handleChoice caller know we're done
  }

  /**
   * Handles all normal path animations and other actions
   * @param {string} passageName name of the passage
   */
  handleNormalPath(passageName) {
    if (
      this.assets
        .get('manifests')
        .get('animationDirectory')
        .hasOwnProperty(passageName)
    ) {
      this.ui.animateMouth(
        this.assets.get('manifests').get('animationDirectory')[passageName][
          'mouthAnimation'
        ]
      );
      let sweat = this.assets.get('manifests').get('animationDirectory')[
        passageName
      ]['sweat'];
      this.ui.showSweat(sweat);
    } else {
      this.ui.animateMouth(`default`);
      this.ui.showSweat(false);
    }
  }
}

class SplashScene extends _Scene {
  id = 'splash';

  handleEvent(event) {
    if (event.type == 'user-choice' && event.detail.loadScreen) {
      // Advance to indicated scene
      this.game.switchScene(event.detail.loadScreen, { ...event.detail });
    }
  }

  async enter() {
    super.enter();
    console.log(`entering ${this.id} scene`);
    this.ui.updateBackground('');
    this.ui.updateBackgroundAudio();

    await this.ui.enterScene(this.id);
    document.addEventListener('user-choice', this);
  }

  async exit() {
    console.log(`exiting ${this.id} scene`);
    document.removeEventListener('user-choice', this);
    await this.ui.exitScene('splash');
  }
}

class GameOverScene extends _Scene {
  id = 'gameover';

  handleEvent(event) {
    if (event.type == 'user-choice') {
      // Advance to next scene
      const nextAction = event.detail.action;
      let startType;
      if (nextAction == 'restart') {
        // Go back to the menu/splash scene to restart
        this.game.switchScene('splash');
      }
    }
  }

  async enter(params) {
    super.enter();
    console.log(`entering ${this.id} scene`);

    const { outcome, ending, passageName } = params;
    const promiseEntered = this.ui.enterScene(this.id);

    this.setBackground(passageName, outcome);

    if (outcome.tag == 'BAD-END') {
      this.ui.updateBackgroundAudio('bad');
    } else {
      this.ui.updateBackgroundAudio();
    }

    this.ui.updateEnding(ending);
    await promiseEntered;
    document.addEventListener('user-choice', this);
  }

  async exit() {
    console.log(`exiting ${this.id} scene`);
    document.removeEventListener('user-choice', this);
    await this.ui.exitScene('gameover');
  }
}

class AchievementsScene extends _Scene {
  id = 'achievements';

  handleEvent(event) {
    if (event.type == 'user-choice') {
      // Advance to next scene
      console.log('Got user choice:');
      const nextAction = event.detail.action;
      let startType;
      if (nextAction == 'restart') {
        // Go back to the menu/splash scene to restart
        this.game.switchScene('splash');
      }
    }
  }

  async enter(params) {
    let savedEndings = this.game.retrieveFromLocal('endings');
    console.log("retrieveFromLocal('endings')", savedEndings);
    super.enter();
    console.log(`entering ${this.id} scene`);
    this.ui.updateBackground('');
    this.ui.updateBackgroundAudio();

    await this.ui.enterScene('achievements', { endings: savedEndings });
    document.addEventListener('user-choice', this);
  }

  async exit() {
    console.log(`exiting ${this.id} scene`);
    document.removeEventListener('user-choice', this);
    await this.ui.exitScene('achievements');
  }
}

/**
  The main game logic
    Owns the game scenes and switches between them
*/

import { STORAGE_KEYS } from './constants.js';

export class Game {
  constructor({ ui, assetsMap }) {
    this.assets = assetsMap;
    this.ui = ui;
    this.currentScene = null;

    const splashScene = new SplashScene(this);
    const choicesScene = new ChoicesScene(this);
    const gameoverScene = new GameOverScene(this);

    this.scenesMap = new Map();
    this.scenesMap.set(splashScene.id, splashScene);
    this.scenesMap.set(choicesScene.id, choicesScene);
    this.scenesMap.set(gameoverScene.id, gameoverScene);
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
   *
   * @param {Object} saveData data to save
   * @param {string} storageName item name in local storage to save to
   */
  saveToLocal(saveData, name) {
    localStorage.setItem(name, JSON.stringify(saveData));
  }
}

class _Scene {
  /**
   *
   * @param {Game} game
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
    this.handleChoice(startPid);
    document.addEventListener('user-choice', this);
  }

  async exit() {
    console.log(`exiting ${this.id} scene`);
    document.removeEventListener('user-choice', this);
    await this.ui.exitScene('prompts');
  }

  handleEvent(event) {
    if (event.type == 'user-choice') {
      console.log('Got user choice:', event.detail);
      this.handleChoice(parseInt(event.detail.id));
    }
  }

  handleChoice(pid) {
    // Process id starts at 1, convert to 0 indexing
    let currentPassage = this.twineData.passages[pid - 1];
    let passageName = currentPassage.name;
    // Get outcome tag
    let outcome = this.countOutcome(currentPassage.tags) || {};

    // handle endings switching to game over scene and early-return
    if (outcome.type == 'END') {
      this.handleEnd(currentPassage, outcome);
      return;
    }
    // handle Menu (right now does nothing)
    if (outcome.type == 'MENU') {
      return;
    }

    this.setBackground(passageName, outcome);

    // handle normal paths
    this.handleNormalPath(passageName);

    // update prompt and wording
    this.ui.updatePrompt(currentPassage.text.split('[[')[0]);
    this.ui.updateWordChoices(currentPassage.links);
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

  handleEnd(currentPassage, outcome) {
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

    // switch to gameover scene
    this.game.switchScene('gameover', {
      outcome: outcome,
      ending: passageText,
      passageName: passageName,
    });
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
    if (event.type == 'user-choice') {
      // Advance to next scene
      console.log('Got user choice:');
      this.game.switchScene('prompts', { ...event.detail });
    }
  }

  async enter() {
    super.enter();
    console.log(`entering ${this.id} scene`);
    this.ui.updateBackground('');

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
      console.log('Got user choice:');
      const nextAction = event.detail.action;
      let startType;
      if (nextAction == 'restart') {
        // TODO: do we want a new startType here? To ensure we randomize the entry point
        // and don't repeat the same path through the passages
        startType = 'default';
        this.game.switchScene('prompts', { startType });
      }
    }
  }

  async enter(params) {
    super.enter();
    console.log(`entering ${this.id} scene`);

    const { outcome, ending, passageName } = params;
    const promiseEntered = this.ui.enterScene(this.id);

    this.setBackground(passageName, outcome);

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

/*
  The main game logic
  - Owns the game loop
  - Handles state changes
*/
export class Game {
  constructor({ ui, assetsMap }) {
    this.assets = assetsMap;
    this.ui = ui;
    this.outcomes = {};
  }
  /*
   * Kick off the game loop
   */
  async start() {
    await this.ui.initialize();
    document.addEventListener('user-choice', this);
    this.twineData = this.assets.get('stories');
    this.imageNames = this.assets.get('images');
    console.log('Game start, with data:', this.twineData);
    // TODO: Figure out what the first state needs to be, and tell the UI about it

    this.handleChoice(this.twineData.startnode);
  }
  handleEvent(event) {
    if (event.type == 'user-choice') {
      console.log('Got user choice:', event.detail);
      this.handleChoice(parseInt(event.detail.id));
      // TODO: The user selected something. Use that input to change our game state
    }
  }

  handleChoice(pid) {
    // Process id starts at 1, convert to 0 indexing
    let currentPassage = this.twineData.passages[pid - 1];

    // Get outcome tag
    let outcome = this.countOutcome(currentPassage.tags);
    if (outcome == null) {
      this.ui.updateBackground(this.imageNames['default']);
    } else {
      this.ui.updateBackground(this.imageNames[outcome]);
    }
    console.log('Outcome: ' + outcome);

    this.ui.updatePrompt(currentPassage.text.split('[[')[0]);
    this.ui.updateWordChoices(currentPassage.links);
  }

  countOutcome(tags) {
    if (tags.includes('BAD-END')) {
      this.outcomes.bad += 1;
      return 'BAD-END';
    } else if (tags.includes('Neutral-Path')) {
      this.outcomes.neutral += 1;
      return 'Neutral-Path';
    } else if (tags.includes('Good-End')) {
      this.outcomes.goodEnd += 1;
      return 'Good-End';
    } else if (tags.includes('Neutral-End')) {
      this.outcomes.neutralEnd += 1;
      return 'Neutral-End';
    } else if (tags.includes('GOOD')) {
      this.outcomes.good += 1;
      return 'GOOD';
    } else if (tags.includes('EGG')) {
      return 'EGG';
    }

    return null;
  }
}

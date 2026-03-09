export class ScoresPanel {
  constructor() {
    this.panel = document.getElementById('scores-panel');
    this.refreshBtn = document.getElementById('scores-refresh');
    this.scores = [];
    
    this.init();
  }

  init() {
    this.refreshBtn.addEventListener('click', () => this.loadScores());
    this.render();
    this.loadScores();
  }

  async loadScores() {
    try {
      this.refreshBtn.textContent = 'Loading...';
      this.refreshBtn.disabled = true;

      // Mock API call - replace with real sports API
      const mockScores = [
        { team1: 'Lakers', team2: 'Warriors', score1: 118, score2: 112, sport: 'NBA', status: 'Final' },
        { team1: 'Chiefs', team2: 'Bills', score1: 31, score2: 24, sport: 'NFL', status: 'Final' },
        { team1: 'Dodgers', team2: 'Yankees', score1: 7, score2: 3, sport: 'MLB', status: 'Final' },
        { team1: 'Liverpool', team2: 'Man City', score1: 2, score2: 1, sport: 'EPL', status: 'Final' },
        { team1: 'Celtics', team2: 'Heat', score1: 108, score2: 95, sport: 'NBA', status: 'Final' },
        { team1: 'Cowboys', team2: 'Giants', score1: 28, score2: 14, sport: 'NFL', status: 'Final' },
        { team1: 'Mets', team2: 'Phillies', score1: 5, score2: 8, sport: 'MLB', status: 'Final' },
        { team1: 'Arsenal', team2: 'Chelsea', score1: 3, score2: 1, sport: 'EPL', status: 'Final' },
        { team1: 'Nuggets', team2: 'Suns', score1: 115, score2: 109, sport: 'NBA', status: 'Final' },
        { team1: 'Ravens', team2: 'Steelers', score1: 21, score2: 17, sport: 'NFL', status: 'Final' }
      ];

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.scores = mockScores;
      this.render();

    } catch (error) {
      console.error('Error loading scores:', error);
      this.showError('Failed to load scores');
    } finally {
      this.refreshBtn.textContent = 'Refresh';
      this.refreshBtn.disabled = false;
    }
  }

  render() {
    if (!this.scores.length) {
      this.panel.innerHTML = `
        <div class="scores-empty">
          <h2>Top 10 Sports Scores</h2>
          <p>Yesterday's most hyped events</p>
          <p class="text-muted">Click Refresh to load scores</p>
        </div>
      `;
      return;
    }

    const scoresHtml = this.scores.map((score, index) => `
      <div class="score-card">
        <div class="score-rank">#${index + 1}</div>
        <div class="score-content">
          <div class="score-teams">
            <span class="team ${score.score1 > score.score2 ? 'winner' : ''}">${score.team1}</span>
            <span class="vs">vs</span>
            <span class="team ${score.score2 > score.score1 ? 'winner' : ''}">${score.team2}</span>
          </div>
          <div class="score-result">
            <span class="score">${score.score1} - ${score.score2}</span>
            <span class="sport-badge">${score.sport}</span>
          </div>
          <div class="score-status">${score.status}</div>
        </div>
      </div>
    `).join('');

    this.panel.innerHTML = `
      <div class="scores-header">
        <h2>Top 10 Sports Scores</h2>
        <p>Yesterday's most hyped events</p>
      </div>
      <div class="scores-list">
        ${scoresHtml}
      </div>
    `;
  }

  showError(message) {
    this.panel.innerHTML = `
      <div class="scores-error">
        <h2>Error</h2>
        <p>${message}</p>
      </div>
    `;
  }
}
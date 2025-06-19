describe('Find Connection Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should find and display a connection path with all required information', () => {
    // Step 1: Enter Source and Target IDs
    cy.get('[data-testid="source-input"]').type('source123');
    cy.get('[data-testid="target-input"]').type('target456');

    // Step 2: Trigger connection search
    cy.get('[data-testid="submit-button"]').click();

    // Step 3: Check loading state
    cy.get('[data-testid="loading-indicator"]').should('exist');
    cy.get('[data-testid="loading-indicator"]').should('not.exist');

    // Step 4: Validate results container
    cy.get('[data-testid="connection-results"]', { timeout: 10000 }).should('exist');

    // Step 5: Check confidence score
    cy.get('[data-testid="confidence-score"]')
      .should('exist')
      .and('contain', '%');

    // Step 6: Check recommended action
    cy.get('[data-testid="recommended-action"]')
      .should('exist')
      .and('contain.text', 'Reach out');

    // Step 7: Check sources
    cy.get('[data-testid="sources-list"]')
      .should('exist')
      .and('contain.text', 'LinkedIn');

    // Step 8: Check path rendering
    cy.get('[data-testid="path-display"]')
      .should('exist')
      .and('contain.text', '→');
  });

  it('should handle no results gracefully', () => {
    // Step 1: Enter non-existent IDs
    cy.get('[data-testid="source-input"]').type('nonExistentSource123');
    cy.get('[data-testid="target-input"]').type('nonExistentTarget456');

    // Step 2: Trigger search
    cy.get('[data-testid="submit-button"]').click();

    // Step 3: Check no results message
    cy.get('[data-testid="no-results-message"]')
      .should('exist')
      .and('contain.text', 'No connection paths found');
  });
}); 
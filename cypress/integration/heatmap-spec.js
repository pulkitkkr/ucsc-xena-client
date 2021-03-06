'use strict';
/*global describe: false, it: false, cy: false, beforeEach: false, expect: false, Cypress: false, before: false, after: false */

var heatmapPage = require('../pages/heatmap');
var transcriptPage = require('../pages/transcripts');
var datapagesPage = require('../pages/datapages');
var hubPage = require('../pages/hub');

var {nav, wizard, spreadsheet} = heatmapPage;

var {setupRecord, setupPlayback, shimResponse} = require('./xhrPlayRecord');

var aCohort = 'TCGA Breast Cancer (BRCA)';
var aTCGAStudy = 'TCGA Lung Adenocarcinoma';
var aGTEXStudy = 'GTEX Lung';
function spy(msg, x) { //eslint-disable-line no-unused-vars
	console.log(msg, x);
	return x;
}

// Strategy here is to run test cases in record mode when
// this is true, but skip any generative tests. Can
// do a record session by setting env in a file, by
// editing this line, or by cli option.
var RECORD = Cypress.env('RECORD'); // default to false

var noop = Object.assign(() => {}, {skip: () => {}, only: () => {}});

// describe test that does not record.
var describeNR = RECORD ? noop : describe;

// Notes
// cypress proxy is introducing long delays when checking for a local hub.
// This can be avoided by 1) going to hub page in the cypress browser, 2)
// disabling localhost, 3) reloading, to force save of sessionStorage.
//
// A test run starts by destroying the current app frame, which prevents
// beforeunload handlers from running.
//
// Unclear how hot-loading should work in this context. Do we want the dev
// stuff to be active?
//
// Initial problems: 1) ajax mucked up, 2) filter( contains() ) not working,
// 3) no tab API, makes it hard to test bookmarks in a new tab
//
// sessionStorage
// 	  It is convenient right now, because it allows disabling the local hub.
// 	  To test a "new tab", we have to explicitly reset tab state: zero sessionStorage;
// 	     and what about history? Does it matter? Or window.opener?
//
// localStorage
// 	  Can we avoid clearing localStorage? Otherwise we will always get the pop-ups.
// 	  Or perhaps, instead, we should explicity turn them off. That may work
// 	  in local test, because the domains are the same, but might fail testing
// 	  against dev, since they are different (cypress served locally, dev on
// 	  aws).
// 	  Nope, it still works. Weird.
// 	  To test localStorage, I think we have to nav to a page, set localStorage,
// 	  nav to a page again, and verify the result.
//
//	localStorage.xenaNotifications = "{"rowHelp":true,"columnHelp":true}";


function clearSessionStorage() {
	window.sessionStorage.clear();
}

function disableHelp() {
	window.localStorage.xenaNotifications = '{"rowHelp":true,"columnHelp":true,"zoomHelp":true}';
}

// run a set of side effects
var exec = (...fns) => () => fns.forEach(fn => fn());

function renderASpreadsheet(load = true) {
	if (load) {
		cy.visit(heatmapPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
	}

	wizard.cohortInput().type(aCohort.slice(0, 10));
	wizard.cohortSelect(aCohort);
	wizard.cohortDone().click();

	wizard.geneExpression().click();
	wizard.somaticMutation().click();
	wizard.copyNumber().click();
	wizard.geneFieldInput().type('TP53');
	wizard.columnDone().click();
	spreadsheet.loadingSpinners().should('not.be.visible');

//	cy.contains('GOT IT').click();
//	cy.contains('GOT IT').click();
}

function playRecord(title) {
	(RECORD ? setupRecord : setupPlayback)(title);
}

describe('Viz page', function() {
	playRecord(this.title);
	it('Renders spreadsheet heatmap and chart', function() {
		cy.visit(heatmapPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		renderASpreadsheet(false);
		spreadsheet.chartView().click();
		spreadsheet.chart();
		spreadsheet.heatmapView().click();
		spreadsheet.kaplanMeierButton(1).click({force: true});
		spreadsheet.kaplanMeier();
	});
});

function renderATranscript() {
	cy.visit(transcriptPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
	transcriptPage.studyA().select(aTCGAStudy);
	transcriptPage.studyB().select(aGTEXStudy);
	transcriptPage.geneFieldInput().type('KRAS');
	transcriptPage.updateGene().click();
	// cypress doesn't seem to have a way to wait on unspecified ajax
	// requests to complete, or to ignore canceled requests. So, if we
	// don't wait on something else here, we'll get an error in the *next*
	// test when the transcript expression request aborts.
	transcriptPage.geneIsLoaded();
}

// XXX move to different file, or revisit the name of this file.
describe('Transcript page', function() {
	playRecord(this.title);
	it('Draws', renderATranscript);
});

describe('Datapages', function () {
	playRecord(this.title);
	it('loads', function() {
		cy.visit(datapagesPage.url,
		         {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		datapagesPage.cohortList().should('exist');
		datapagesPage.cohortSelect(aCohort);
	});
});

describe('Hub page', function () {
	playRecord(this.title);
	it('loads', function () {
		cy.visit(hubPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		hubPage.hubList().should('exist');
	});
	it('updates cohorts', function () {
		cy.visit(hubPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		hubPage.hubItem(hubPage.hubs.tcga).click();
		nav.spreadsheet().click(); // via nav link
		nav.waitForTransition();
		wizard.cohortInput().type(aCohort.slice(0, 10));
		wizard.cohortSuggestItems().should('exist')
			.then(items => items.toArray().map(e => e.innerText))
			.should('not.contain', aCohort);
		nav.hub().click();         // via nav link
		nav.waitForTransition();
		hubPage.hubItem(hubPage.hubs.tcga).click();
		nav.spreadsheet().click(); // via nav link
		nav.waitForTransition();
		wizard.cohortInput().type(aCohort.slice(0, 10));
		wizard.cohortSuggestItems().should('exist')
			.then(items => items.toArray().map(e => e.innerText))
			.should('contain', aCohort);

		cy.visit(hubPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		hubPage.hubItem(hubPage.hubs.tcga).click();
		cy.visit(heatmapPage.url); // via page load
		wizard.cohortInput().type(aCohort.slice(0, 10));
		wizard.cohortSuggestItems().should('exist')
			.then(items => items.toArray().map(e => e.innerText))
			.should('not.contain', aCohort);
		cy.visit(hubPage.url);     // via page load
		hubPage.hubItem(hubPage.hubs.tcga).click();
		cy.visit(heatmapPage.url); // via page load
		wizard.cohortInput().type(aCohort.slice(0, 10));
		wizard.cohortSuggestItems().should('exist')
			.then(items => items.toArray().map(e => e.innerText))
			.should('contain', aCohort);
	});
});

var replayBookmark = xhr => {
	var content = decodeURIComponent(xhr.request.body.slice("content=".length));
	cy.route({
		url: '/api/bookmarks/bookmark*',
		method: 'GET',
		onRequest: shimResponse(content, 200),
		response: 'placeholder',
	}).as('readBookmark');
};

var screenshot = file => () => {
	// This is a clunky work-around to get cypress controls out of the way while
	// screenshotting.
	var reporter = window.parent.document.getElementsByClassName('reporter-wrap')[0],
		display = reporter.style.display;
	reporter.style.display = 'none';

	return cy.wait(100).screenshot(file).then(() => {
		reporter.style.display = display;
	});
};

// XXX would like to cover this in a generative test.
describeNR('Datapages circuit', function () {
	setupPlayback(['Datapages', 'Viz page']);
	it('retains heatmap view if cohort unchanged', function () {

		renderASpreadsheet(true);
		cy.scrollTo('topLeft').then(screenshot('heatmap'));

		cy.visit(datapagesPage.url);
		datapagesPage.cohortSelect(aCohort);
		datapagesPage.cohortVisualize().click();

		nav.waitForTransition(); // nav button animation
		cy.scrollTo('topLeft').then(screenshot('heatmapAgain'));
		cy.exec('babel-node cypress/compareImages.js heatmap heatmapAgain')
			.its('stdout').should('contain', 'same');
	});
});

var query = url => url.split(/\?/)[1];
var highchartAnimation = 2000; // XXX move to page object
var bootstrapAnimation = 2000;
describeNR('Bookmark', function() {
	setupPlayback(['Viz page', 'Transcript page']);
	it('Saves and restores heatmap and chart', function() {
		cy.route('POST', '/api/bookmarks/bookmark', '{"id": "1234"}').as('bookmark');

		///////////////////////////////////////
		// Bookmark a spreadsheet
		//

		renderASpreadsheet();

		cy.scrollTo('topLeft').then(screenshot('heatmap'));

		nav.bookmarkMenu().click();
		nav.bookmark().click();

		//
		// Capture the bookmark, and load it in a new session
		//

		cy.wait('@bookmark').then(replayBookmark);

		cy.visit(heatmapPage.url + '?bookmark=1234', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=1234'));
		spreadsheet.loadingSpinners().should('not.be.visible');
		cy.scrollTo('topLeft').then(screenshot('heatmapBookmark'));

		//
		// Assert that the bookmark image matches the original heatmap
		//

		cy.exec('babel-node cypress/compareImages.js heatmap heatmapBookmark')
			.its('stdout').should('contain', 'same');

		///////////////////////////////////////
		// Bookmark KM
		//

		cy.scrollTo('topLeft');

		// XXX Coerce a re-render, which is necessary if we haven't rendered
		// the column since the features were fetched. This is because we
		// only compute disableKM on render. If we don't re-render, the KM button
		// will be disabled, becase we rendered before 'features' were fetched.
		// Should move disableKM to a selector.
		spreadsheet.colCanvas(1).click({force: true}); // zoom to re-render

		spreadsheet.kaplanMeierButton(1).click({force: true});
		cy.wait(bootstrapAnimation);
		spreadsheet.kaplanMeier();
		cy.scrollTo('topLeft').then(screenshot('kaplanMeier'));

		nav.bookmarkMenu().click();
		nav.bookmark().click();

		//
		// Capture the bookmark, and load it in a new session
		//

		cy.wait('@bookmark').then(replayBookmark);

		cy.visit(heatmapPage.url + '?bookmark=a1b2', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=a1b2'));
		spreadsheet.loadingSpinners().should('not.be.visible');
		cy.wait(bootstrapAnimation);
		cy.scrollTo('topLeft').then(screenshot('kaplanMeierBookmark'));

		//
		// Assert that the bookmark image matches the original KM
		//

		cy.exec('babel-node cypress/compareImages.js kaplanMeier kaplanMeierBookmark')
			.its('stdout').should('contain', 'same');

		// XXX move to page object
		cy.get('.kmDialog .close').click();

		///////////////////////////////////////
		// Bokmark chart mode
		//

		spreadsheet.chartView().click();

		// XXX move to page object
		cy.get('.highcharts-root').wait(highchartAnimation);
		cy.scrollTo('topLeft').then(screenshot('chart'));

		nav.bookmarkMenu().click();
		nav.bookmark().click();

		//
		// Capture the bookmark, and load it in a new session
		//

		cy.wait('@bookmark').then(replayBookmark);

		cy.visit(heatmapPage.url + '?bookmark=abcd', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=abcd'));
		// XXX move to page object
		cy.get('.highcharts-root').wait(highchartAnimation);
		cy.scrollTo('topLeft').then(screenshot('chartBookmark'));

		//
		// Assert that the bookmark image matches the original heatmap
		//

		cy.exec('babel-node cypress/compareImages.js chart chartBookmark')
			.its('stdout').should('contain', 'same');
	});
	it('Saves and restores transcript', function() {
		cy.route('POST', '/api/bookmarks/bookmark', '{"id": "1234"}').as('bookmark');

		///////////////////////////////////////
		// Bookmark a transcript
		//

		renderATranscript();

		cy.scrollTo('topLeft').then(screenshot('transcript'));

		nav.bookmarkMenu().click();
		nav.bookmark().click();

		//
		// Capture the bookmark, and load it in a new session
		//

		cy.wait('@bookmark').then(replayBookmark);

		cy.visit(transcriptPage.url + '?bookmark=1234', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=1234'));
		transcriptPage.geneIsLoaded();
		cy.scrollTo('topLeft').then(screenshot('transcriptBookmark'));

		//
		// Assert that the bookmark image matches the original heatmap
		//

		cy.exec('babel-node cypress/compareImages.js transcript transcriptBookmark')
			.its('stdout').should('contain', 'same');
	});
	it('Doesn\'t conflict with other pages', function() {
		cy.route('POST', '/api/bookmarks/bookmark', '{"id": "1234"}').as('bookmark');
		///////////////////////////////////////
		// Restore from transcript page should not alter spreadsheet.
		// Wizard should be functional.
		//
		// Save initial screenshot

		cy.visit(heatmapPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		spreadsheet.waitForViewport();
		// Hide "View live example" link because it keeps changing.
		// XXX should we close the header, instead?
		spreadsheet.examples().then(el => el.hide());
		cy.scrollTo('topLeft').then(screenshot('initialSpreadsheet'));
		spreadsheet.examples().then(el => el.show());
		renderATranscript();

		nav.bookmarkMenu().click();
		nav.bookmark().click();
		cy.wait('@bookmark').then(replayBookmark);

		// Loading transcript bookmark
		cy.visit(transcriptPage.url + '?bookmark=1234', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=1234'));
		transcriptPage.geneIsLoaded();

		// Switch to heatmap
		nav.spreadsheet().click();
		nav.waitForTransition();
		spreadsheet.examples().then(el => el.hide());
		cy.scrollTo('topLeft').then(screenshot('afterBookmarkSpreadsheet'));
		spreadsheet.examples().then(el => el.show());

		cy.exec('babel-node cypress/compareImages.js initialSpreadsheet afterBookmarkSpreadsheet')
			.its('stdout').should('contain', 'same');

		// Confirm wizard is functioning
		renderASpreadsheet(false);
	});
	it('Bookmarks wizard states', function() {
		cy.route('POST', '/api/bookmarks/bookmark', '{"id": "1234"}').as('bookmark');

		// Do step 1
		cy.visit(heatmapPage.url, {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		wizard.cohortInput().type(aCohort.slice(0, 10));
		wizard.cohortSelect(aCohort);
		wizard.cohortDone().click();

		// screenshot & bookmark step 1
		spreadsheet.examples().then(el => el.hide());
		cy.scrollTo('topLeft').then(screenshot('step1'));
		spreadsheet.examples().then(el => el.show());

		nav.bookmarkMenu().click();
		nav.bookmark().click();

		// load bookmark
		cy.wait('@bookmark').then(replayBookmark);
		cy.visit(heatmapPage.url + '?bookmark=1234', {onBeforeLoad: exec(clearSessionStorage, disableHelp)});
		cy.wait('@readBookmark').then(xhr => expect(query(xhr.url)).to.equal('id=1234'));

		wizard.cards(); // wait for render

		spreadsheet.examples().then(el => el.hide());
		cy.scrollTo('topLeft').then(screenshot('step1Bookmark'));
		spreadsheet.examples().then(el => el.show());
		cy.exec('babel-node cypress/compareImages.js step1 step1Bookmark');

		// Ensure sure step 2 still works
		wizard.geneExpression().click();
		wizard.somaticMutation().click();
		wizard.copyNumber().click();
		wizard.geneFieldInput().type('TP53');
		wizard.columnDone().click();
		spreadsheet.loadingSpinners().should('not.be.visible');
	});
});

// problem is that noops have random sequences inside them, state
// changes on one or both pages. Does the runner need to know that?
// The random sequence has to also be executed by the runner. The
// runner should probably just do one step, then.
//
// Running assertions should not be part of the sequence that can
// be dropped.
//var noops = [
//	{steps: ['bookmark', 'sequence', 'restore']},
//	{steps: ['reload']},
//	{steps: ['switchPage', 'sequence', 'switchBack']}
//];

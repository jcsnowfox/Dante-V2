const sharedAdminPages = require("./renderAdminPages/shared");
const topLevelAdminPages = require("./renderAdminPages/topLevelPages");
const adminToolsPageModule = require("./renderAdminPages/adminToolsPage");
const imagesPagesModule = require("./renderAdminPages/imagesPages");
const audioPagesModule = require("./renderAdminPages/audioPages");
const heartbeatPageModule = require("./renderAdminPages/heartbeatPage");
const proactivePagesModule = require("./renderAdminPages/proactivePages");
const memoryPagesModule = require("./renderAdminPages/memoryPages");
const channelModesPageModule = require("./renderAdminPages/channelModesPage");
const musicPagesModule = require("./renderAdminPages/musicPages");
const emotionalArcPageModule = require("./renderAdminPages/emotionalArcPage");
const feedbackLearningPageModule = require("./renderAdminPages/feedbackLearningPage");
const relationalStatePageModule = require("./renderAdminPages/relationalStatePage");
const secondLifePageModule = require("./renderAdminPages/secondLifePage");
const { renderGameAdminPage } = require("../games/http/renderGameAdminPage");

module.exports = {
  renderShell: sharedAdminPages.renderShell,
  renderSubnav: sharedAdminPages.renderSubnav,
  renderHomePage: topLevelAdminPages.renderHomePage,
  renderCompanionPage: topLevelAdminPages.renderCompanionPage,
  renderBehaviourPage: topLevelAdminPages.renderBehaviourPage,
  renderImagesPage: imagesPagesModule.renderImagesSettingsPage,
  renderImagesSettingsPage: imagesPagesModule.renderImagesSettingsPage,
  renderImagesLayout: imagesPagesModule.renderImagesLayout,
  renderImagesGalleryPage: imagesPagesModule.renderImagesGalleryPage,
  renderImageDetailPage: imagesPagesModule.renderImageDetailPage,
  renderGalleryLayout: audioPagesModule.renderGalleryLayout,
  renderToolsLayout: audioPagesModule.renderToolsLayout,
  renderGifToolsPage: audioPagesModule.renderGifToolsPage,
  renderAudioSettingsPage: audioPagesModule.renderAudioSettingsPage,
  renderAudioGalleryPage: audioPagesModule.renderAudioGalleryPage,
  renderAudioDetailPage: audioPagesModule.renderAudioDetailPage,
  renderMusicGalleryPage: musicPagesModule.renderMusicGalleryPage,
  renderMemoryLayout: memoryPagesModule.renderMemoryLayout,
  renderMemoryMapPage: memoryPagesModule.renderMemoryMapPage,
  renderMemoryImportsPage: memoryPagesModule.renderMemoryImportsPage,
  renderMemoryReviewPage: memoryPagesModule.renderMemoryReviewPage,
  renderMemoryCuratorPage: memoryPagesModule.renderMemoryCuratorPage,
  renderSchedulesPage: proactivePagesModule.renderSchedulesPage,
  renderJournalsPage: proactivePagesModule.renderJournalsPage,
  renderHeartbeatPage: heartbeatPageModule.renderHeartbeatPage,
  renderAdminToolsPage: adminToolsPageModule.renderAdminToolsPage,
  renderChannelModesPage: channelModesPageModule.renderChannelModesPage,
  renderEmotionalArcPage: emotionalArcPageModule.renderEmotionalArcPage,
  renderFeedbackLearningPage: feedbackLearningPageModule.renderFeedbackLearningPage,
  renderRelationalStatePage: relationalStatePageModule.renderRelationalStatePage,
  renderSecondLifePage: secondLifePageModule.renderSecondLifePage,
  renderGameAdminPage,
};

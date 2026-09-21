import { RequestInfo } from 'rwsdk/worker'
import { LoginButton } from '@/components/atoms/LoginButton'

export function Home({ ctx }: RequestInfo) {
  return (
    <div className="home-page">
      <title>TrackFootball.app - Social Network for Football Players</title>
      <meta
        name="description"
        content="Join TrackFootball, the social network for casual football players. Record your game with any GPS watch or phone, upload your activities, and improve your performance with data-driven insights."
      />
      <div className="hero-landing">
        <div className="hero-image">
          <img alt="" src="/assets/core/landing/images/hero_intro.jpg"></img>
        </div>
        <div className="overlay" />
        <div className="content-wrapper">
          <div className="title-line" />
          <h1 className="title">Improve Your Game</h1>
          <p className="copy">
            TrackFootball is a social network for casual Football players. Play
            football and record your game with any GPS watch/phone and upload it
            to TrackFootball.
          </p>
          <div className="home-cta">
            <LoginButton>Get started now</LoginButton>
          </div>
        </div>
      </div>
      <div className="hero-stats">
        <div className="stats">
          <div className="stat-icon">
            <img
              alt=""
              src="/assets/core/landing/images/stat_icons/analyse.svg"
            ></img>
          </div>
          <span>Track, Analyse and Improve Your Game</span>
        </div>
        <div className="stats">
          <div className="stat-icon">
            <img
              alt=""
              src="/assets/core/landing/images/stat_icons/compare.svg"
            ></img>
          </div>
          <span>Compete with Your Friends</span>
        </div>
        <div className="stats">
          <div className="stat-icon">
            <img
              alt=""
              src="/assets/core/landing/images/stat_icons/overview.svg"
            ></img>
          </div>
          <span>Get Overview of Progress</span>
        </div>
        <div className="stats">
          <div className="stat-icon">
            <img
              className="share-icon"
              alt=""
              src="/assets/core/landing/images/stat_icons/share.svg"
            ></img>
          </div>
          <span>Share on Social Media</span>
        </div>
      </div>

      <div className="hero-landing hero-community">
        <div className="hero-image">
          <img alt="" src="/assets/core/landing/images/hero_club.jpg"></img>
        </div>
        <div className="overlay" />
        <div className="content-wrapper">
          <h2 className="title">Brought by Football Berlin</h2>
          <p className="copy">
            Local football comunity with ~100 diverse nationalities dedicated to
            helping players improve their game. You don&apos;t need to play for
            a club to get meaningful stats for your game.
          </p>
          <div className="home-cta">
            <LoginButton>Get started now</LoginButton>
          </div>
        </div>
      </div>
    </div>
  )
}

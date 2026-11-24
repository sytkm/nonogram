---
name: パズル誌
description: 画像から作って遊ぶパズルの共通デザイン
colors:
  paper: "#ffffff"
  ink: "#20201f"
  rule: "#a09d98"
  strong-rule: "#57534e"
  accent: "#ad3024"
  accent-active: "#88251c"
  accent-tint: "#f8e8e2"
  subtle: "#f1efed"
  hover: "#f0ede9"
typography:
  body:
    fontFamily: "system-ui, sans-serif"
    fontWeight: 400
  home-title:
    fontFamily: "system-ui, sans-serif"
    fontWeight: 850
    lineHeight: 1.12
    letterSpacing: "-0.035em"
rounded:
  control: "0.2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
---

## Overview

白地・黒インク・朱色のパズル誌。ホームは「画像から問題を作る」を最初に置き、実際のサンプルは罫線の間に載せる。サンプルや日替わりからすぐ遊ぶ入口と、前回の続きも用意する。

## Colors

共通色は `styles/start.css` の `--ui-*`。朱色は主操作や選択状態に使う。ボードの色、ヒントやフォーカスの印は各パズルの機能色として扱う。問題画像と盤面の色は共通色で上書きしない。

## Typography

日本語の見出しは太さと大きさで段差をつけ、本文と操作名は読み慣れた端末のゴシック系で揃える。時計とキー表記の等幅文字には用途がある。

## Layout

罫線と余白で役割を区切る。ホームではPC幅で説明・操作とサンプルを横に、スマホ幅で縦に並べる。プレイ面は盤面を中心にし、画面幅に応じて操作が折り返す。

## Components

共通化するのは見出し、ボタン、フォーカス、区切り線、モーダルの枠。ノノグラムのマス目、数字、パレット、分割区画の見せ方はパズル固有の要素とする。別のパズルが追加されたら、同じ部品の原則に従い、そのパズル自身の問題例を載せる。

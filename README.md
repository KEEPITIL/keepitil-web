# KEEPITIL — public production build

This repository is the **deployment artifact** for https://keepitil.com. It is not a
development repository and it holds no source of truth.

* Development, internal documentation, tests, tooling, operational playbooks and
  planning live in the private KEEPITIL source repository.
* Only files a customer's browser actually needs are published here.
* History starts at this repository's first commit on purpose. The source repository's
  history was deliberately not mirrored, because that history contains internal material.

## What may enter this repository

A file is here because the public website requires it: customer-facing pages, browser
runtime JS/CSS, approved media, icons, manifest, service worker, legal pages, sitemaps,
robots.txt and the hosting files Pages needs.

## What must never enter

Internal documentation, operational playbooks, agent or NEXUS material, engineering
directives, internal marketing plans, test suites, development scripts, server-only
source, `.env*` files, credentials or keys of any kind.

Publishing here is a deliberate act. If something is not required by a customer's
browser, it belongs in the private source repository instead.

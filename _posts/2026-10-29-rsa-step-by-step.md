---
layout: post
title: "cryptography from scratch: the RSA algorithm, step by step"
date: 2026-10-29 00:00:00 +0700
description: how public-key cryptography works, the handful of number theory RSA needs, a full key generation, encryption and decryption worked out by hand, and three interactive figures to make your own keys, encrypt your own messages and try to break them
tags: cryptography math algorithms interactive
categories: explainer
math: true
toc:
  sidebar: left
css:
  - /assets/css/screen-works.css
  - /assets/css/rsa.css
js:
  - /assets/js/screen-works.js
  - /assets/js/rsa.js
---

Every time you see the padlock in your browser's address bar, two computers that have never met have agreed on a secret while anyone on the network could listen in. That sounds impossible. If you shout a password across a room, everyone hears it.

**RSA**, published in 1977 by Rivest, Shamir and Adleman, was the first practical way around this. It is still everywhere: TLS certificates, SSH keys, code signing, PGP email. And the whole thing fits on an index card. You only need school arithmetic and a few facts about whole numbers.

This post builds RSA from the ground up. We'll do one complete example by hand, with every number shown, and then you can generate your own keys, encrypt your own messages and try to crack them in the three figures below.

## The problem: sharing a secret in public

The oldest kind of encryption is **symmetric**: the same key locks and unlocks. Caesar shifted letters by a fixed amount; AES, the modern standard, scrambles blocks of bits. Both sides need the same key.

That's the catch. To send Bob a secret, Alice first needs to send him the key, and the key is itself a secret. If she had a safe way to send it, she wouldn't need encryption.

**Public-key** cryptography breaks the loop by splitting the key in two:

- a **public key** that anyone may have, which only _locks_, and
- a **private key** that only its owner has, which _unlocks_.

Think of an open padlock. Bob hands out copies of it to everyone. Anyone can snap it shut on a box, but only Bob has the key that opens it.

<figure class="sw-fig">
  <span class="sw-badge">Schematic</span>
  <h4 class="sw-caption" data-toc-skip>Only the public half ever travels.</h4>
  <ol class="sw-pipe sw-build">
    <li class="sw-stage"><span class="sw-num">01</span><span class="sw-label">Bob</span><p>Makes a key pair, publishes (n, e)</p></li>
    <li class="sw-stage"><span class="sw-num">02</span><span class="sw-label">Alice</span><p>Locks her message with (n, e)</p></li>
    <li class="sw-stage is-active"><span class="sw-num">03</span><span class="sw-label">Wire</span><p>Eve sees only the locked number</p></li>
    <li class="sw-stage"><span class="sw-num">04</span><span class="sw-label">Bob</span><p>Unlocks it with his private d</p></li>
  </ol>
  <p class="sw-note">The private key d never leaves Bob's machine.</p>
</figure>

For this to work we need a "padlock" made of maths: a function that is easy to compute forwards, very hard to undo, _unless_ you know one extra secret. RSA's padlock is built from multiplying primes.

## The number theory toolkit

RSA uses five ideas. Each one is small.

### 1. Clock arithmetic (mod)

$$a \bmod n$$ is the remainder when you divide $$a$$ by $$n$$. A clock does arithmetic mod 12: four hours after 10 o'clock is 2 o'clock, because $$14 \bmod 12 = 2$$.

When two numbers leave the same remainder we write $$a \equiv b \pmod n$$. So $$14 \equiv 2 \pmod{12}$$, and $$-1 \equiv 11 \pmod{12}$$.

The useful fact is that you can take the remainder _whenever you like_ during a calculation and the final answer doesn't change. That keeps numbers small, which matters when we raise things to huge powers.

### 2. Primes, and why multiplying is a one-way street

A **prime** has no divisors except 1 and itself: 2, 3, 5, 7, 11, 13, …

Multiplying two primes is instant: $$61 \times 53 = 3233$$. Going back, from 3233 to $$61 \times 53$$, means hunting for a divisor. For small numbers that's quick. For a 600-digit number made of two 300-digit primes, nobody knows how to do it in any reasonable time. This gap between "easy forwards" and "hard backwards" is RSA's padlock.

### 3. Greatest common divisor and Euclid's algorithm

$$\gcd(a, b)$$ is the largest number that divides both. If it's 1, $$a$$ and $$b$$ are **coprime**: they share no factor.

Euclid found a fast way to compute it over 2,000 years ago. Divide, keep the remainder, repeat:

$$\gcd(3120, 17)$$: $$\;3120 = 183 \times 17 + 9$$, $$\;17 = 1 \times 9 + 8$$, $$\;9 = 1 \times 8 + 1$$, $$\;8 = 8 \times 1 + 0$$.

The last non-zero remainder is the gcd, here 1. So 3120 and 17 are coprime.

### 4. Euler's totient, φ(n)

$$\varphi(n)$$ counts how many numbers from 1 to $$n$$ are coprime to $$n$$. For a prime $$p$$, every smaller number counts, so $$\varphi(p) = p - 1$$. For a product of two different primes,

$$
\varphi(p q) = (p-1)(q-1).
$$

If you know $$p$$ and $$q$$, that's one multiplication. If you only know $$n = pq$$, computing $$\varphi(n)$$ is as hard as factoring $$n$$. Keep that in mind; it's the trapdoor.

**Euler's theorem** says that if $$m$$ is coprime to $$n$$, then

$$
m^{\varphi(n)} \equiv 1 \pmod n.
$$

Raising to the power $$\varphi(n)$$ brings you back to 1. This is the fact that makes decryption work.

### 5. Modular inverses

The **inverse** of $$e$$ mod $$\varphi$$ is the number $$d$$ with $$e \cdot d \equiv 1 \pmod{\varphi}$$. It exists exactly when $$\gcd(e, \varphi) = 1$$.

The **extended** Euclid algorithm finds it by running Euclid's divisions while carrying one extra number along. We'll do it by hand in a moment.

### 6. Fast powers: square and multiply

Encryption computes things like $$65^{17} \bmod 3233$$. With real keys the exponent has hundreds of digits, so multiplying 65 by itself that many times is out of the question.

Instead, write the exponent in binary and walk its bits from left to right. Start at 1. For each bit, **square** the running value; if the bit is 1, also **multiply** by the base. Take the remainder after every step. An exponent with $$k$$ bits needs only about $$k$$ squarings, so even a 2048-bit exponent takes a couple of thousand steps.

## The RSA recipe

Here is the whole algorithm.

**Key generation** (Bob, once):

1. Pick two large, different, secret primes $$p$$ and $$q$$.
2. Compute the modulus $$n = p q$$.
3. Compute $$\varphi(n) = (p-1)(q-1)$$.
4. Choose a public exponent $$e$$ with $$1 < e < \varphi(n)$$ and $$\gcd(e, \varphi(n)) = 1$$.
5. Compute the private exponent $$d = e^{-1} \bmod \varphi(n)$$.

The **public key** is $$(n, e)$$. The **private key** is $$d$$ (and $$p$$, $$q$$, $$\varphi(n)$$ must be kept secret or destroyed).

**Encryption** (Alice, with the public key): turn the message into a number $$m$$ with $$0 \le m < n$$, then

$$
c = m^{e} \bmod n.
$$

**Decryption** (Bob, with the private key):

$$
m = c^{d} \bmod n.
$$

That's it. Now let's run it.

## A complete example by hand

We'll use tiny primes so every number fits on the page. Real keys use the same steps with numbers hundreds of digits long.

### Step 1: two primes

$$p = 61$$ and $$q = 53$$. Both are prime (no divisor up to their square roots, 7 and 7).

### Step 2: the modulus

$$
n = 61 \times 53 = 3233.
$$

### Step 3: the totient

$$
\varphi(n) = (61 - 1)(53 - 1) = 60 \times 52 = 3120.
$$

### Step 4: the public exponent

We need $$e$$ coprime to 3120. Since $$3120 = 2^4 \times 3 \times 5 \times 13$$, small choices like 3, 5 and 13 are out. Let's take $$e = 17$$. We already checked with Euclid above that $$\gcd(3120, 17) = 1$$.

### Step 5: the private exponent

We want $$d$$ with $$17 d \equiv 1 \pmod{3120}$$. The extended Euclid algorithm keeps a table. Each row holds a remainder $$r$$ and a number $$t$$, and every row obeys

$$
r \equiv t \times 17 \pmod{3120}.
$$

The first two rows are free: $$3120 \equiv 0 \times 17$$ and $$17 \equiv 1 \times 17$$. Then each new row is _the row two above, minus $$q$$ times the row above_, where $$q$$ is the quotient of the two remainders. Subtracting rows keeps the rule true.

| row | quotient $$q$$ | remainder $$r$$ | $$t$$                    |
| --- | -------------- | --------------- | ------------------------ |
| 0   |                | 3120            | 0                        |
| 1   |                | 17              | 1                        |
| 2   | 183            | 9               | $$0 - 183 \times 1 = -183$$  |
| 3   | 1              | 8               | $$1 - 1 \times (-183) = 184$$ |
| 4   | 1              | **1**           | $$-183 - 1 \times 184 = $$ **−367** |
| 5   | 8              | 0               |                          |

Row 4 has remainder 1, so $$1 \equiv -367 \times 17 \pmod{3120}$$. The inverse is $$-367$$, and adding 3120 to make it positive:

$$
d = -367 + 3120 = 2753.
$$

Check: $$17 \times 2753 = 46801 = 15 \times 3120 + 1$$. ✓

So Bob's **public key** is $$(n, e) = (3233, 17)$$ and his **private key** is $$d = 2753$$.

### Encrypting

Alice wants to send $$m = 65$$ (the ASCII code for "A"). She computes $$c = 65^{17} \bmod 3233$$ with square and multiply. In binary, $$17 = 10001_2$$.

| bit | square                         | multiply by 65?              | running value |
| --- | ------------------------------ | ---------------------------- | ------------- |
| 1   | $$1^2 = 1$$                    | $$1 \times 65 = 65$$         | 65            |
| 0   | $$65^2 = 4225 \to 992$$        |                              | 992           |
| 0   | $$992^2 = 984064 \to 1232$$    |                              | 1232          |
| 0   | $$1232^2 = 1517824 \to 1547$$  |                              | 1547          |
| 1   | $$1547^2 = 2393209 \to 789$$   | $$789 \times 65 = 51285 \to 2790$$ | **2790**  |

(The arrow means "take the remainder mod 3233".) Five steps instead of sixteen multiplications, and no number ever grows past $$3233^2$$.

$$
c = 65^{17} \bmod 3233 = 2790.
$$

Alice sends 2790. Eve can see it, and she knows $$n = 3233$$ and $$e = 17$$, but that's all.

### Decrypting

Bob computes

$$
m = 2790^{2753} \bmod 3233.
$$

The exponent 2753 is $$101011000001_2$$, twelve bits, so it's twelve rounds of square and multiply. (You can watch every round in the second figure below.) The result is

$$
2790^{2753} \bmod 3233 = 65.
$$

The original message is back. ✓

## Make your own keys

Now it's your turn. Change $$p$$, $$q$$ or $$e$$ and every step re-runs: the primality checks, Euclid's table for the gcd, the extended Euclid table for $$d$$, and the final check that $$e \cdot d \equiv 1$$. Try a number that isn't prime, or an $$e$$ that shares a factor with $$\varphi(n)$$, and see which step stops you.

<div class="rsa-figure" data-rsa-figure="keygen">
  <p class="rsa-placeholder">Loading interactive figure…</p>
  <noscript><p class="rsa-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="rsa-caption">The random button picks primes with the browser's secure random generator and tests them with Miller–Rabin. Keys made here are toys: never use them for anything real.</p>

A few things to try:

- Set $$e = 13$$ with the default primes. It fails, because 13 divides 3120.
- Set $$p = 57$$. It fails, because $$57 = 3 \times 19$$.
- Roll random 9-digit primes. The tables barely get longer: the number of steps in Euclid's algorithm grows with how many _digits_ the numbers have, not with how big they are.

## Encrypt and decrypt

This figure uses whatever key you made above. In **number** mode, type a message $$m$$ and watch $$m^e \bmod n$$ worked out bit by bit, then the decryption $$c^d \bmod n$$ worked out the same way. You can also type your own ciphertext into the second box and decrypt it.

In **text** mode, each byte of your text is encrypted as its own number. (You need $$n > 255$$ for that, so the default key works, but 2-digit primes won't.)

<div class="rsa-figure" data-rsa-figure="crypt">
  <p class="rsa-placeholder">Loading interactive figure…</p>
  <noscript><p class="rsa-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="rsa-caption">Grey rows are 0 bits: square only. Long exponents scroll inside their table.</p>

Look at "HELLO" in text mode: the two L's encrypt to the same number. Hold on to that; it's the first hint that the RSA in this post is not yet safe to use.

## Why decryption gives back the message

Decryption computes $$c^d = (m^e)^d = m^{ed}$$. We chose $$d$$ so that $$e d \equiv 1 \pmod{\varphi(n)}$$, which means $$e d = 1 + k \varphi(n)$$ for some whole number $$k$$ (in our example, $$46801 = 1 + 15 \times 3120$$). So

$$
m^{ed} = m^{1 + k\varphi(n)} = m \cdot \left(m^{\varphi(n)}\right)^k \equiv m \cdot 1^k = m \pmod n,
$$

using Euler's theorem for the middle step. Every factor of $$m^{\varphi(n)}$$ collapses to 1 and only $$m$$ is left.

Euler's theorem needs $$m$$ coprime to $$n$$. If $$m$$ happens to be a multiple of $$p$$ or $$q$$, the result still holds; you can check it separately mod $$p$$ and mod $$q$$ and glue the answers together with the Chinese remainder theorem. With real 300-digit primes, hitting such an $$m$$ by chance is practically impossible anyway.

## Signatures: the same maths, backwards

RSA works in both directions. If Bob raises a number to his _private_ exponent, anyone can undo it with his _public_ one. That proves the number came from Bob, since nobody else could have produced it.

To sign a message, Bob hashes it to a number $$h$$ (smaller than $$n$$) and computes the signature

$$
s = h^d \bmod n.
$$

Anyone can verify it by checking that $$s^e \bmod n = h$$. With our key and $$h = 123$$:

$$
s = 123^{2753} \bmod 3233 = 2746, \qquad 2746^{17} \bmod 3233 = 123. \; ✓
$$

This is how your browser knows a website's certificate really was issued by a certificate authority, and how your phone knows an update really came from its maker.

## Why it's hard to break

Eve knows $$n$$ and $$e$$. To decrypt she needs $$d$$. To get $$d$$ she needs $$\varphi(n)$$. To get $$\varphi(n)$$ she needs $$p$$ and $$q$$. Every road leads to **factoring** $$n$$.

The most obvious way to factor is trial division: try 3, 5, 7, 9, … up to $$\sqrt n$$. Try it below. The figure starts with your key from above, and after a run it uses the speed it measured to estimate how long the same attack would take on bigger keys.

<div class="rsa-figure" data-rsa-figure="crack">
  <p class="rsa-placeholder">Loading interactive figure…</p>
  <noscript><p class="rsa-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="rsa-caption">With 6-digit primes the attack is instant. With 9-digit primes it takes several seconds, and with 12-digit primes it would run for hours: every extra digit in p and q multiplies the work by about 10.</p>

Trial division is the slowest method. The best known one, the general number field sieve, is enormously faster, and the record public factorisation is an 829-bit RSA number (RSA-250, in 2020), which took thousands of CPU-years. That's why today's keys are at least 2048 bits, and 3072 or 4096 for anything that has to stay secret for decades.

There is one big asterisk. A large enough **quantum computer** running Shor's algorithm could factor such numbers quickly. None exists yet, but it's the reason new "post-quantum" schemes such as ML-KEM are being rolled out alongside RSA.

## Textbook RSA is not real RSA

What we built here is called **textbook RSA**, and you should never use it as is. Three problems:

1. **It's deterministic.** The same message always gives the same ciphertext, which is what the repeated L's showed. If Eve guesses that the message is "yes" or "no", she can encrypt both with the public key and compare.
2. **It's malleable.** Ciphertexts can be combined without decrypting them. Eve can take Alice's $$c = 2790$$, multiply it by $$2^{17} \bmod 3233 = 1752$$, and send $$2790 \times 1752 \bmod 3233 = 3017$$. Bob decrypts that to $$130 = 2 \times 65$$: Eve doubled the message without ever reading it.
3. **Small messages leak.** With $$e = 3$$ and a short message where $$m^3 < n$$, the "mod" never kicks in, and Eve just takes an ordinary cube root.

Real systems fix all of this with **padding**: before encrypting, the message is mixed with fresh random bytes in a carefully designed way (OAEP for encryption, PSS for signatures). Every encryption of "yes" then looks different, and tampered ciphertexts fail to decode.

They also don't encrypt long messages with RSA at all. RSA is slow compared to symmetric ciphers, so in practice it's used once, to send or sign a short random key, and a fast symmetric cipher such as AES does the rest. This is called **hybrid encryption**.

And they use a well-tested library rather than code like the figures here. Real implementations also guard against attacks that watch _how long_ a computation takes or how much power it uses, which a simple square-and-multiply loop leaks.

## Summary

- Public-key cryptography splits a key into a public half that locks and a private half that unlocks, so strangers can talk securely without meeting first.
- RSA's key is two secret primes $$p, q$$. The public key is $$n = pq$$ and an exponent $$e$$; the private key is $$d = e^{-1} \bmod (p-1)(q-1)$$, found with the extended Euclid algorithm.
- Encryption is $$c = m^e \bmod n$$, decryption is $$m = c^d \bmod n$$, both computed fast with square and multiply. Euler's theorem is why they undo each other.
- Swapping the roles of $$e$$ and $$d$$ gives digital signatures.
- Breaking RSA means factoring $$n$$, which is infeasible for 2048-bit numbers with today's computers.
- Textbook RSA is only the core. Real RSA adds random padding, wraps a symmetric cipher, and lives in carefully written libraries.

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 800;
        
        this.balls = 12;
        this.currentRing = 1;
        this.placedBalls = [];
        
        // Remplacer l'initialisation statique des rings par l'appel à createRings()
        this.rings = this.createRings();
        
        // Initialiser les multiplicateurs avec le bonus +1 bille dès le début
        this.multipliers = [2, 3, 5, 10, 50, 100];
        this.segmentProbabilities = [
            0.70,     // X2  : 70% -> 1.40
            0.20,     // X3  : 20% -> 0.60
            0.08,     // X5  : 8%  -> 0.40
            0.015,    // X10 : 1.5% -> 0.15
            0.004,    // X50 : 0.4% -> 0.20
            0.001     // X100: 0.1% -> 0.10
        ];
        
        this.score = 0;
        this.gameOver = false;
        this.finalMultiplier = 1;
        
        // Ajout des positions valides pour les billes
        this.validBallPositions = this.calculateValidBallPositions();
        
        this.setupEventListeners();
        this.isPlacingBalls = true;
        this.isSpinning = false;
        
        this.ballsHistory = [[], [], []]; // Historique pour chaque anneau
        
        this.bonusCumule = 0;  // Initialiser le bonus cumulé à 0
        
        this.bonusAnimation = null;  // Pour stocker l'état de l'animation du bonus
        this.bonusAnimationStartTime = 0;  // Pour suivre le temps de l'animation
        
        this.messageAnimation = null;
        this.messageAnimationStartTime = 0;
        this.messageText = '';
        this.messageType = ''; // 'success', 'gameover', ou 'info'
        
        this.draw();
    }

    createRings() {
        const rings = [];
        const ringConfigs = [
            { segments: 5, openDoors: 1, hasBonus: true, bonusAmount: 3 },     // Premier anneau : bonus 3€
            { segments: 3, openDoors: 1, hasBonus: true, bonusAmount: [15, '+1'] },    // Deuxième anneau : bonus 15€ ET +1 bille
            { segments: 3, openDoors: 1, hasBonus: true, bonusAmount: 30 }     // Troisième anneau : bonus 30€
        ];

        for (let i = 0; i < 3; i++) {
            const config = ringConfigs[i];
            const segments = new Array(config.segments).fill('red');
            
            const greenIndex = Math.floor(Math.random() * config.segments);
            segments[greenIndex] = 'green';

            const totalAngle = Math.PI * 2;
            let segmentAngle;
            let bonusWidth;
            let bonusWidth2;
            let bonusStartAngle;
            let bonus2StartAngle;

            if (config.hasBonus) {
                if (Array.isArray(config.bonusAmount)) {
                    // Pour le deuxième anneau avec deux bonus
                    bonusWidth = totalAngle / 55;  // Pour le bonus 15€
                    bonusWidth2 = totalAngle / (55/4); // Pour le bonus +1 bille (4 fois plus grand)
                    
                    // Répartir les segments normaux sur la moitié du cercle restante
                    const availableAngle = totalAngle - bonusWidth - bonusWidth2;
                    segmentAngle = availableAngle / config.segments;
                    
                    // Placer le premier bonus après les segments normaux
                    bonusStartAngle = config.segments * segmentAngle;
                    
                    // Placer le deuxième bonus après le premier
                    bonus2StartAngle = bonusStartAngle + bonusWidth;
                } else {
                    bonusWidth = totalAngle / (config.bonusAmount === 30 ? 110 : 11);
                    bonusWidth2 = 0;
                    segmentAngle = (totalAngle - bonusWidth) / config.segments;
                    bonusStartAngle = config.segments * segmentAngle;
                    bonus2StartAngle = 0;
                }
            } else {
                segmentAngle = totalAngle / config.segments;
                bonusWidth = 0;
                bonusWidth2 = 0;
                bonusStartAngle = 0;
                bonus2StartAngle = 0;
            }

            const ring = {
                segments,
                rotation: 0,
                radius: 300 - i * 80,
                segmentCount: config.segments,
                hasBonus: config.hasBonus || false,
                bonusWidth: bonusWidth,
                bonusWidth2: bonusWidth2,
                segmentAngle: segmentAngle,
                bonusAmount: config.bonusAmount || 0,
                hasDualBonus: Array.isArray(config.bonusAmount),
                bonusStartAngle: bonusStartAngle,
                bonus2StartAngle: bonus2StartAngle
            };

            rings.push(ring);
        }

        return rings;
    }

    calculateValidBallPositions() {
        const positions = [];
        const currentRingIndex = this.currentRing - 1;
        const ring = this.rings[currentRingIndex];
        const segmentAngle = (Math.PI * 2) / ring.segmentCount;
        
        for (let i = 0; i < ring.segmentCount; i++) {
            const angle = i * segmentAngle + (segmentAngle / 2);
            positions.push({
                x: Math.cos(angle) * (ring.radius + 20),
                y: Math.sin(angle) * (ring.radius + 20),
                angle: angle
            });
        }
        return positions;
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        document.getElementById('placeBalls').addEventListener('click', () => this.finalizeBallPlacement());
        document.getElementById('spin').addEventListener('click', () => this.spinRing());
    }

    handleCanvasClick(e) {
        if (!this.isPlacingBalls || this.gameOver) return;
        
        // Empêcher de placer des billes si on n'est pas dans la phase initiale
        // et qu'on a déjà le bon nombre de billes placées
        if (this.currentRing > 1 && this.placedBalls.length >= this.balls) return;

        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left - this.canvas.width / 2;
        const clickY = e.clientY - rect.top - this.canvas.height / 2;

        let closestPosition = null;
        let minDistance = Infinity;

        this.validBallPositions.forEach(pos => {
            const distance = Math.sqrt(
                Math.pow(clickX - pos.x, 2) + 
                Math.pow(clickY - pos.y, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestPosition = pos;
            }
        });

        if (minDistance < 30 && this.placedBalls.length < this.balls) {
            // Compter combien de billes sont déjà à cette position
            const ballsAtPosition = this.placedBalls.filter(ball => 
                ball.angle === closestPosition.angle
            ).length;
            
            // Calculer un décalage pour la nouvelle bille
            const offset = ballsAtPosition * 15; // 15 pixels de décalage par bille
            
            this.placedBalls.push({
                x: closestPosition.x + this.canvas.width / 2,
                y: closestPosition.y + this.canvas.height / 2,
                angle: closestPosition.angle,
                offset: offset // Sauvegarder le décalage
            });
            
            this.updateUI();
            this.draw();
        }
    }

    finalizeBallPlacement() {
        if (this.placedBalls.length === 0) {
            return; // Ne rien faire si aucune bille n'est placée
        }
        
        // Si des billes n'ont pas été placées, les considérer comme perdues
        if (this.placedBalls.length < this.balls) {
            this.balls = this.placedBalls.length;
        }
        
        this.isPlacingBalls = false;
        document.getElementById('placeBalls').disabled = true;
        document.getElementById('spin').disabled = false;
    }

    spinRing() {
        if (this.isSpinning) return;
        this.isSpinning = true;
        document.getElementById('spin').disabled = true;
        
        const currentRingIndex = this.currentRing - 1;
        const ring = this.rings[currentRingIndex];
        
        // Ajoutons des logs pour vérifier
        console.log(`Rotation anneau ${currentRingIndex + 1}:`);
        console.log(`- Nombre total de segments: ${ring.segmentCount}`);
        console.log(`- Segments verts: ${ring.segments.filter(s => s === 'green').length}`);
        
        // Sélection aléatoire
        const selectedSegment = Math.floor(Math.random() * ring.segmentCount);
        console.log(`- Segment sélectionné: ${selectedSegment}`);

        const spinDuration = 4000;
        const startTime = Date.now();

        // Calculer la rotation pour aligner un segment vert avec le segment sélectionné
        const segmentAngle = (Math.PI * 2) / ring.segmentCount;
        const greenSegmentIndex = ring.segments.findIndex(s => s === 'green');
        
        // La rotation doit amener le segment vert à la position du segment sélectionné
        let finalRotation = (selectedSegment * segmentAngle) - (greenSegmentIndex * segmentAngle);
        
        // S'assurer que la rotation est positive
        if (finalRotation < 0) {
            finalRotation += Math.PI * 2;
        }

        // Augmenter le nombre de tours complets (de 3 à 8 tours)
        finalRotation += Math.PI * 2 * (8 + Math.random());

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / spinDuration;
            
            if (progress < 1) {
                const easeOut = 1 - Math.pow(1 - progress, 2);
                ring.rotation = easeOut * finalRotation;
                this.draw();
                requestAnimationFrame(animate);
            } else {
                ring.rotation = finalRotation;
                this.isSpinning = false;
                this.checkResults();
            }
        };
        
        animate();
    }

    checkResults() {
        const currentRingIndex = this.currentRing - 1;
        this.ballsHistory[currentRingIndex] = [...this.placedBalls];
        
        const ring = this.rings[currentRingIndex];
        const survivingBalls = [];
        let bonusHit = false;

        // Vérifier chaque bille
        this.placedBalls.forEach(ball => {
            let adjustedAngle = (ball.angle - ring.rotation) % (Math.PI * 2);
            if (adjustedAngle < 0) {
                adjustedAngle += Math.PI * 2;
            }
            
            const normalSegmentsAngle = ring.segmentAngle * ring.segmentCount;
            
            // Vérifier si la bille est dans le segment bonus
            if (ring.hasBonus && adjustedAngle >= normalSegmentsAngle && 
                adjustedAngle < (normalSegmentsAngle + ring.bonusWidth)) {
                if (!bonusHit) {
                    if (ring.bonusAmount === '+1') {
                        this.balls++; // Ajouter une bille
                        this.showBonusEffect('+1 bille');
                    } else {
                        this.score += ring.bonusAmount * 100;
                        this.bonusCumule += ring.bonusAmount;
                        this.showBonusEffect(ring.bonusAmount);
                    }
                    bonusHit = true;
                }
            } else {
                // Vérifier les segments normaux
                const segmentIndex = Math.floor(adjustedAngle / ring.segmentAngle);
                if (segmentIndex < ring.segments.length && ring.segments[segmentIndex] === 'green') {
                    survivingBalls.push({
                        x: ball.x,
                        y: ball.y,
                        angle: ball.angle
                    });
                }
            }
        });

        // Si on a touché le bonus, attendre l'animation
        if (bonusHit) {
            setTimeout(() => {
                this.processResults(survivingBalls);
            }, 4000);
            return;
        }

        // Sinon, traiter les résultats immédiatement
        this.processResults(survivingBalls);
    }

    // Nouvelle méthode pour traiter les résultats
    processResults(survivingBalls) {
        if (survivingBalls.length === 0) {
            // Ne pas effacer les billes immédiatement
            this.gameOver = true;
            if (this.bonusCumule > 0) {
                this.showMessage(`PARTIE TERMINEE\nBRAVO, vous avez remporté ${this.bonusCumule}€`, 'success');
            } else {
                this.showMessage('PERDU !\nVous pouvez retenter votre chance', 'gameover');
            }
            // Effacer les billes après la durée du message
            setTimeout(() => {
                this.placedBalls = [];
                this.draw();
            }, 4000);
        } else if (this.currentRing >= 3) {
            this.placedBalls = survivingBalls;
            this.finalPhase();
        } else {
            // Passage à l'anneau suivant
            this.balls = survivingBalls.length;
            this.currentRing++;
            // Garder les billes pendant l'affichage du message
            const oldBalls = [...this.placedBalls];
            this.showMessage(`${this.balls} bille(s) ont survécu !\nPlacez-les sur l'anneau suivant`, 'success');
            // Effacer les billes après la durée du message
            setTimeout(() => {
                this.placedBalls = [];
                this.isPlacingBalls = true;
                document.getElementById('placeBalls').disabled = false;
                document.getElementById('spin').disabled = true;
                this.validBallPositions = this.calculateValidBallPositions();
                this.draw();
            }, 4000);
        }
        
        this.updateUI();
        this.draw();
    }

    finalPhase() {
        const centerRadius = 100;
        const segmentAngle = (Math.PI * 2) / 6;

        let ballsProcessed = 0;
        let totalScore = 0;
        let extraBalls = 0;

        const processBall = () => {
            if (ballsProcessed < this.placedBalls.length) {
                let startTime = Date.now();
                const spinDuration = 6000;

                // Sélectionner un segment basé sur les probabilités
                const random = Math.random();
                let cumulativeProbability = 0;
                let finalSegment = 0;
                
                for (let i = 0; i < this.segmentProbabilities.length; i++) {
                    cumulativeProbability += this.segmentProbabilities[i];
                    if (random <= cumulativeProbability) {
                        finalSegment = i;  // Ne pas inverser ici
                        break;
                    }
                }

                const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = elapsed / spinDuration;

                    if (progress < 1) {
                        this.ctx.save();
                        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);

                        const easeOut = 1 - Math.pow(1 - progress, 3);
                        const ballAngle = this.placedBalls[ballsProcessed].angle;
                        
                        const randomOffset = -15 + (Math.random() * 5);
                        const offset = (randomOffset * Math.PI) / 180;
                        const targetRotation = ballAngle - (finalSegment * segmentAngle) + offset;
                        const rotation = (easeOut * 10 * Math.PI * 2) + targetRotation;
                        this.ctx.rotate(rotation);

                        // Dessiner les segments du cercle central
                        for (let i = 0; i < 6; i++) {
                            this.ctx.beginPath();
                            this.ctx.moveTo(0, 0);
                            this.ctx.arc(0, 0, centerRadius, i * segmentAngle, (i + 1) * segmentAngle);
                            this.ctx.fillStyle = `hsl(${i * 60}, 70%, 50%)`;
                            this.ctx.fill();
                            this.ctx.stroke();

                            // Afficher les multiplicateurs
                            this.ctx.save();
                            this.ctx.rotate(i * segmentAngle + segmentAngle / 2);
                            this.ctx.translate(centerRadius * 0.7, 0);
                            this.ctx.rotate(-rotation);
                            this.ctx.fillStyle = 'white';
                            this.ctx.font = '20px Arial';
                            this.ctx.textAlign = 'center';
                            this.ctx.fillText(`X${this.multipliers[i]}`, 0, 0);
                            this.ctx.restore();
                        }

                        this.ctx.restore();
                        requestAnimationFrame(animate);
                    } else {
                        const multiplier = this.multipliers[finalSegment];
                        const baseScore = 300;
                        this.placedBalls[ballsProcessed].finalSegment = finalSegment;
                        
                        // Gérer le bonus +1 bille
                        if (multiplier === '+1') {
                            extraBalls++; // Compter une bille bonus
                            totalScore += baseScore; // Score de base sans multiplicateur
                        } else {
                            totalScore += Math.floor(baseScore * Number(multiplier));
                        }
                        
                        ballsProcessed++;
                        setTimeout(processBall, 500);
                    }
                };

                animate();
            } else {
                // Une fois toutes les billes traitées
                this.score = totalScore;
                this.balls += extraBalls; // Ajouter les billes bonus au total
                
                this.gameOver = true;
                setTimeout(() => {
                    let resultMessage = `Félicitations !\n`;
                    resultMessage += `${this.placedBalls.length} bille(s) au centre\n\n`;
                    
                    // Ajouter les multiplicateurs obtenus par bille
                    this.placedBalls.forEach((ball, index) => {
                        const multiplier = this.multipliers[ball.finalSegment];
                        if (this.placedBalls.length === 1) {
                            resultMessage += `Bille : ${multiplier}\n`;
                        } else {
                            resultMessage += `Bille ${index + 1} : ${multiplier}\n`;
                        }
                    });
                    
                    // Ajouter l'information sur les billes bonus gagnées
                    if (extraBalls > 0) {
                        resultMessage += `\nBilles bonus gagnées : +${extraBalls}`;
                    }
                    
                    const euros = (this.score / 100).toFixed(2);
                    resultMessage += `\nScore final: ${this.score} points !`;
                    resultMessage += `\nGain : ${euros}€`;
                    
                    this.showMessage(resultMessage, 'success');
                }, 1000);
            }
        };

        processBall();
    }

    // Nouvelle méthode pour stocker l'historique des positions des billes
    getBallsHistoryForRing(ringIndex) {
        return this.ballsHistory[ringIndex];
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        
        // 1. Dessiner les anneaux d'abord
        this.rings.forEach(ring => {
            this.drawRing(ring);
        });
        
        // 2. Dessiner la roue centrale par-dessus
        const centerRadius = 100;
        const segmentAngle = (Math.PI * 2) / 6;
        
        // Dessiner les segments du cercle central
        for (let i = 0; i < 6; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, centerRadius, i * segmentAngle, (i + 1) * segmentAngle);
            this.ctx.fillStyle = `hsl(${i * 60}, 70%, 50%)`;
            this.ctx.fill();
            this.ctx.stroke();

            // Afficher les multiplicateurs
            this.ctx.save();
            this.ctx.rotate(i * segmentAngle + segmentAngle / 2);
            this.ctx.translate(centerRadius * 0.7, 0);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`X${this.multipliers[i]}`, 0, 0);
            this.ctx.restore();
        }
        
        // 3. Dessiner les emplacements possibles si on est en phase de placement
        if (this.isPlacingBalls) {
            this.drawValidPositions();
        }
        
        // 4. Dessiner les billes placées
        this.placedBalls.forEach(ball => {
            this.drawBall(ball);
        });
        
        // Afficher le score en haut
        if (this.score > 0) {
            this.ctx.font = '24px Arial';
            this.ctx.fillStyle = 'white';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Score: ${this.score}`, 0, -350);
        }

        // Dessiner l'animation du bonus si elle est active
        if (this.bonusAnimation) {
            const elapsed = Date.now() - this.bonusAnimationStartTime;
            const duration = 1500;
            const progress = elapsed / duration;

            if (progress < 1) {
                const scale = 1 + Math.sin(progress * Math.PI) * 0.5;
                const opacity = 1 - progress;

                this.ctx.save();
                // Ne pas faire de translation ici car on est déjà au centre
                this.ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
                this.ctx.shadowBlur = 20;
                
                this.ctx.font = 'bold 48px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                this.ctx.scale(scale, scale);
                
                this.ctx.strokeStyle = `rgba(255, 215, 0, ${opacity})`;
                this.ctx.lineWidth = 3;
                this.ctx.strokeText('GAIN BONUS 3€', 0, 0);
                
                this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                this.ctx.fillText('GAIN BONUS 3€', 0, 0);
                
                this.ctx.restore();
            } else {
                this.bonusAnimation = null;
            }
        }

        // Afficher le message animé s'il est actif
        if (this.messageAnimation) {
            const elapsed = Date.now() - this.messageAnimationStartTime;
            const duration = 4000;
            const progress = elapsed / duration;

            if (progress < 1) {
                const scale = 1 + Math.sin(progress * Math.PI) * 0.2;
                const opacity = progress < 0.1 ? progress * 10 : 
                               progress > 0.9 ? (1 - progress) * 10 : 
                               1;

                // Style selon le type de message
                let color;
                switch(this.messageType) {
                    case 'success':
                        color = '#00ff00';
                        break;
                    case 'gameover':
                        color = '#ff0000';
                        break;
                    case 'bonus':
                        color = '#ffd700';
                        break;
                    default:
                        color = '#ffffff';
                }

                this.ctx.save();
                this.ctx.font = 'bold 36px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                // Dessiner chaque ligne
                const lines = this.messageText.split('\n');
                const lineHeight = 45;
                const totalHeight = lines.length * lineHeight;
                const startY = -totalHeight / 2;
                
                lines.forEach((line, i) => {
                    this.ctx.fillStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
                    this.ctx.fillText(line, 0, startY + (i * lineHeight));
                });
                
                this.ctx.restore();
            } else {
                this.messageAnimation = null;
            }
        }

        // Afficher la mise et le bonus cumulé en bas du canvas
        this.ctx.save();
        this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2); // Annuler la translation du centre
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'right';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(`MISE : 3€`, this.canvas.width - 200, this.canvas.height - 60);
        this.ctx.fillText(`BONUS CUMULE : ${this.bonusCumule.toFixed(2)}€`, this.canvas.width - 20, this.canvas.height - 30);
        this.ctx.restore();

        this.ctx.restore(); // Restore final
    }

    drawRing(ring) {
        this.ctx.save();
        this.ctx.rotate(ring.rotation);
        
        // Dessiner les segments normaux
        let currentAngle = 0;
        ring.segments.forEach((color, i) => {
            const segmentWidth = Math.min(60, 360 / ring.segmentCount);
            
            this.ctx.beginPath();
            this.ctx.arc(0, 0, ring.radius, currentAngle, currentAngle + ring.segmentAngle);
            
            const segmentGradient = this.ctx.createLinearGradient(
                Math.cos(currentAngle) * ring.radius,
                Math.sin(currentAngle) * ring.radius,
                Math.cos(currentAngle + ring.segmentAngle) * ring.radius,
                Math.sin(currentAngle + ring.segmentAngle) * ring.radius
            );
            
            if (color === 'red') {
                segmentGradient.addColorStop(0, '#ff1a1a');
                segmentGradient.addColorStop(0.5, '#ff0000');
                segmentGradient.addColorStop(1, '#cc0000');
            } else {
                segmentGradient.addColorStop(0, '#00ff00');
                segmentGradient.addColorStop(0.5, '#00cc00');
                segmentGradient.addColorStop(1, '#009900');
            }
            
            this.ctx.strokeStyle = segmentGradient;
            this.ctx.lineWidth = segmentWidth;
            this.ctx.stroke();
            
            currentAngle += ring.segmentAngle;
        });
        
        // Dessiner le segment bonus
        if (ring.hasBonus) {
            let currentAngle = ring.segmentCount * ring.segmentAngle;

            if (ring.hasDualBonus) {
                // Dessiner le premier bonus (15€)
                this.ctx.beginPath();
                this.ctx.arc(0, 0, ring.radius, ring.bonusStartAngle, ring.bonusStartAngle + ring.bonusWidth);
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = Math.min(60, 360 / ring.segmentCount);
                this.ctx.stroke();

                // Texte du premier bonus
                this.ctx.save();
                this.ctx.rotate(ring.bonusStartAngle + ring.bonusWidth/2);
                this.ctx.translate(ring.radius, 0);
                this.ctx.rotate(Math.PI/2);
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('15€', 0, 0);
                this.ctx.restore();

                // Dessiner le deuxième bonus (+1 bille)
                this.ctx.beginPath();
                this.ctx.arc(0, 0, ring.radius, ring.bonus2StartAngle, ring.bonus2StartAngle + ring.bonusWidth2);
                this.ctx.strokeStyle = '#0066ff'; // Changement de la couleur en bleu
                this.ctx.lineWidth = Math.min(60, 360 / ring.segmentCount);
                this.ctx.stroke();

                // Texte du deuxième bonus
                this.ctx.save();
                this.ctx.rotate(ring.bonus2StartAngle + ring.bonusWidth2/2);
                this.ctx.translate(ring.radius, 0);
                this.ctx.rotate(Math.PI/2);
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('+1 bille', 0, 0);
                this.ctx.restore();
            } else {
                // Code existant pour les bonus simples
                this.ctx.beginPath();
                this.ctx.arc(0, 0, ring.radius, currentAngle, currentAngle + ring.bonusWidth);
                
                if (ring.bonusAmount === 30) {
                    this.ctx.strokeStyle = '#8A2BE2'; // Violet pour le bonus 30€
                } else {
                    this.ctx.strokeStyle = '#ffd700'; // Or pour les autres bonus
                }
                
                this.ctx.lineWidth = Math.min(60, 360 / ring.segmentCount);
                this.ctx.stroke();

                // Texte du bonus
                this.ctx.save();
                this.ctx.rotate(currentAngle + ring.bonusWidth/2);
                this.ctx.translate(ring.radius, 0);
                this.ctx.rotate(Math.PI/2);
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(ring.bonusAmount + '€', 0, 0); // Ajout du symbole €
                this.ctx.restore();
            }
        }
        
        this.ctx.restore();
    }

    drawBall(ball) {
        this.ctx.save();
        
        const angle = ball.angle;
        const offsetX = Math.cos(angle) * (ball.offset || 0);
        const offsetY = Math.sin(angle) * (ball.offset || 0);
        const x = ball.x - this.canvas.width / 2 + offsetX;
        const y = ball.y - this.canvas.height / 2 + offsetY;
        
        // Effet de halo externe
        const outerGlow = this.ctx.createRadialGradient(x, y, 0, x, y, 20);
        outerGlow.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
        outerGlow.addColorStop(0.5, 'rgba(0, 255, 255, 0.1)');
        outerGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = outerGlow;
        this.ctx.fill();
        
        // Corps principal de la bille avec gradient
        const ballGradient = this.ctx.createRadialGradient(x - 3, y - 3, 0, x, y, 8);
        ballGradient.addColorStop(0, '#ffffff');
        ballGradient.addColorStop(0.7, '#40a0ff');
        ballGradient.addColorStop(1, '#2080ff');
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = ballGradient;
        this.ctx.fill();
        
        // Reflet brillant
        this.ctx.beginPath();
        this.ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.fill();
        
        this.ctx.restore();
    }

    drawValidPositions() {
        this.validBallPositions.forEach(pos => {
            // Compter le nombre de billes à cette position
            const ballsAtPosition = this.placedBalls.filter(ball => 
                ball.angle === pos.angle
            ).length;
            
            // Afficher le nombre de billes si > 0
            if (ballsAtPosition > 0) {
                this.ctx.font = '16px Orbitron';
                this.ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(ballsAtPosition.toString(), pos.x, pos.y - 20);
            }
            
            // Toujours afficher l'emplacement s'il reste des billes à placer
            if (this.placedBalls.length < this.balls) {
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                this.ctx.fill();
            }
        });
    }

    updateUI() {
        // Afficher le nombre total de billes restantes
        document.getElementById('ballCount').textContent = this.balls;
        document.getElementById('currentRing').textContent = this.currentRing;
        
        // Afficher le nombre de billes restantes à placer
        const ballsToPlace = this.isPlacingBalls ? this.balls - this.placedBalls.length : 0;
        document.getElementById('ballsToPlace').textContent = ballsToPlace;
    }

    showBonusEffect(amount) {
        this.showMessage(`GAIN BONUS ${amount}€`, 'bonus');
    }

    showMessage(text, type = 'info') {
        this.messageAnimation = true;
        this.messageAnimationStartTime = Date.now();
        this.messageText = text;
        this.messageType = type;
        
        const animate = () => {
            if (this.messageAnimation) {
                this.draw();
                requestAnimationFrame(animate);
            }
        };
        animate();
    }
}

// Démarrer le jeu
window.onload = () => new Game(); 
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("OnTix Smart Contract", function () {
    async function deployFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();
        const Contract = await ethers.getContractFactory("OnTix");
        const onTix = await Contract.deploy();
        await onTix.waitForDeployment();
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const oneDay = 24 * 60 * 60;
        const tokenURIs = ["ipfs://uri1", "ipfs://uri2", "ipfs://uri3", "ipfs://uri4", "ipfs://uri5", "ipfs://uri6", "ipfs://uri7", "ipfs://uri8", "ipfs://uri9", "ipfs://uri10", "ipfs://uri11", "ipfs://uri12"];
        await onTix.createEvent(
            "Concert",
            "Jakarta",
            now + 2 * oneDay,
            now + 3 * oneDay,
            ethers.parseEther("1"),
            12,
            now,
            now + 1 * oneDay,
            ethers.parseEther("2"),
            tokenURIs
        );
        return { onTix, owner, addr1, addr2, now, oneDay };
    }

    describe("createEvent()", function () {
        it("should allow anyone to create an event successfully", async function () {
            const { onTix, owner } = await loadFixture(deployFixture);
            expect(await onTix.nextEventId()).to.equal(1);
        });
        it("should emit EventCreated success event", async function () {
            const { onTix, now, owner } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 2000,
                    now + 3000,
                    ethers.parseEther("1"),
                    1,
                    now,
                    now + 1000,
                    ethers.parseEther("2"),
                    ["ipfs://uri"]
                )
            ).to.emit(onTix, "EventCreated")
                .withArgs(1, owner.address);
        });
        it("should revert if event start time is more than event end time", async function () {
            const { onTix, now } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 3000,
                    now + 2000,
                    ethers.parseEther("1"),
                    1,
                    now,
                    now + 1000,
                    ethers.parseEther("2"),
                    ["ipfs://uri"]
                )
            ).to.be.revertedWith("Invalid event time");
        });
        it("should revert if resale start time is more than resale end time", async function () {
            const { onTix, now } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 2000,
                    now + 3000,
                    ethers.parseEther("1"),
                    1,
                    now + 1000,
                    now,
                    ethers.parseEther("2"),
                    ["ipfs://uri"]
                )
            ).to.be.revertedWith("Invalid resale window");
        });
        it("should revert if price cap is lower than the original ticket price", async function () {
            const { onTix, now } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 2000,
                    now + 3000,
                    ethers.parseEther("2"),
                    1,
                    now,
                    now + 1000,
                    ethers.parseEther("1"),
                    ["ipfs://uri"]
                )
            ).to.be.revertedWith("Cap must >= ticket price");
        });
        it("should revert if token URIs doesn't match with max ticket that can be generated", async function () {
            const { onTix, now } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 2000,
                    now + 3000,
                    ethers.parseEther("1"),
                    1,
                    now,
                    now + 1000,
                    ethers.parseEther("2"),
                    ["ipfs://uri1", "ipfs://uri2"]
                )
            ).to.be.revertedWith("TokenURIs must match maxTickets");
        });
        it("should revert if resale doesn't end before event starts", async function () {
            const { onTix, now } = await loadFixture(deployFixture);
            await expect(
                onTix.createEvent(
                    "Concert",
                    "Jakarta",
                    now + 2000,
                    now + 3000,
                    ethers.parseEther("1"),
                    1,
                    now,
                    now + 4000,
                    ethers.parseEther("2"),
                    ["ipfs://uri"]
                )
            ).to.be.revertedWith("Resale must end before event starts");
        });
    });

    describe("buyTickets()", function () {
        it("should allow buyer to buy tickets successfully", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 2, {
                value: ethers.parseEther("2")
            });
            const eventData = await onTix.events(0);
            expect(eventData.ticketsSold).to.equal(2);
            const eventBalance = await onTix.eventProceeds(0);
            expect(await eventBalance).to.equal(ethers.parseEther("2"));
        });
        it("should emit TicketPurchased success event", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await expect(
                onTix.connect(addr1).buyTickets(0, 2, {
                    value: ethers.parseEther("2")
                })
            ).to.emit(onTix, "TicketPurchased").withArgs(0, addr1.address)
                .to.emit(onTix, "TicketPurchased").withArgs(1, addr1.address);
        });
        it("should revert if ticket sales period ended", async function () {
            const { onTix, addr1, now, oneDay } = await loadFixture(deployFixture);
            await ethers.provider.send("evm_setNextBlockTimestamp", [now + 4 * oneDay]);
            await ethers.provider.send("evm_mine");
            await expect(
                onTix.connect(addr1).buyTickets(0, 2, {
                    value: ethers.parseEther("2"),
                })
            ).to.be.revertedWith("Ticket sales period ended");
        });
        it("should revert if not enough ticket to buy anymore", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await expect(
                onTix.connect(addr1).buyTickets(0, 20, {
                    value: ethers.parseEther("20"),
                })
            ).to.be.revertedWith("Not enough tickets");
        });
        it("should revert if not enough ETH sent", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await expect(
                onTix.connect(addr1).buyTickets(0, 1, {
                    value: ethers.parseEther("0.5"),
                })
            ).to.be.revertedWith("Incorrect ETH amount");
        });
    });

    describe("withdrawEventProceeds()", function () {
        it("should allow event creator to withdraw proceeds successfully", async function () {
            const { onTix, owner, addr1 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(onTix.connect(owner).withdrawEventProceeds(0)).to.changeEtherBalance(owner, ethers.parseEther("1"));
        });
        it("should emit EventProceedsWithdrawn after successful withdrawal", async function () {
            const { onTix, addr1, owner } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(onTix.connect(owner).withdrawEventProceeds(0))
                .to.emit(onTix, "EventProceedsWithdrawn")
                .withArgs(0, owner.address, ethers.parseEther("1"));
        });
        it("should revert if non-creator tries to withdraw", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await expect(
                onTix.connect(addr1).withdrawEventProceeds(0)
            ).to.be.revertedWith("Not event owner");
        });
        it("should revert if non-creator tries to withdraw", async function () {
            const { onTix, owner } = await loadFixture(deployFixture);
            await expect(
                onTix.connect(owner).withdrawEventProceeds(0)
            ).to.be.revertedWith("No funds to withdraw");
        });
    });

    describe("listForResale()", function () {
        it("should allow ticket owner to list for resale successfully", async function () {
            const { onTix, addr1, now } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            expect(await onTix.resalePrice(0)).to.equal(ethers.parseEther("1.5"));
            expect(await onTix.resaleSeller(0)).to.equal(addr1.address);
        });
        it("should emit TicketListedForResale success event", async function () {
            const { onTix, addr1, now } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"))
            ).to.emit(onTix, "TicketListedForResale").withArgs(0, ethers.parseEther("1.5"));
        });
        it("should revert if sender is not the ticket owner", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).listForResale(0, ethers.parseEther("1.5"))
            ).to.be.revertedWith("Not ticket owner");
        });
        it("should revert if ticket is already resold", async function () {
            const { onTix, addr1, addr2, now } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            await onTix.connect(addr2).buyResaleTickets([0], {
                value: ethers.parseEther("1.5"),
            });
            await expect(
                onTix.connect(addr2).listForResale(0, ethers.parseEther("1"))
            ).to.be.revertedWith("Already resold once");
        });
        it("should revert if outside of resale period", async function () {
            const { onTix, addr1, now, oneDay } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await ethers.provider.send("evm_setNextBlockTimestamp", [now + 4 * oneDay]);
            await ethers.provider.send("evm_mine");
            await expect(
                onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"))
            ).to.be.revertedWith("Resale not allowed now");
        });
        it("should revert if resale price exceeds cap", async function () {
            const { onTix, addr1, now } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr1).listForResale(0, ethers.parseEther("3"))
            ).to.be.revertedWith("Exceeds price cap");
        });
    });

    describe("buyResaleTickets()", function () {
        it("should allow buyer to purchase resale ticket successfully", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            await onTix.connect(addr2).buyResaleTickets([0], {
                value: ethers.parseEther("1.5"),
            });
            expect(await onTix.ownerOf(0)).to.equal(addr2.address);
        });
        it("should emit TicketResold success event", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            await expect(
                onTix.connect(addr2).buyResaleTickets([0], {
                    value: ethers.parseEther("1.5"),
                })
            ).to.emit(onTix, "TicketResold")
                .withArgs(0, addr1.address, addr2.address);
        });
        it("should revert if ticket expired", async function () {
            const { onTix, addr1, addr2, now, oneDay } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            await ethers.provider.send("evm_setNextBlockTimestamp", [now + 4 * oneDay]);
            await ethers.provider.send("evm_mine");
            await expect(
                onTix.connect(addr2).buyResaleTickets([0], {
                    value: ethers.parseEther("1.5"),
                })
            ).to.be.revertedWith("Ticket has expired");
        });
        it("should revert if ticket is not listed", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).buyResaleTickets([0], {
                    value: ethers.parseEther("1"),
                })
            ).to.be.revertedWith("Not listed");
        });
        it("should revert if ticket already resold", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1"));
            await onTix.connect(addr2).buyResaleTickets([0], {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).buyResaleTickets([0], {
                    value: ethers.parseEther("1"),
                })
            ).to.be.revertedWith("Already resold");
        });
        it("should revert if msg.value is not equal to total resale price", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1.5"));
            await expect(
                onTix.connect(addr2).buyResaleTickets([0], {
                    value: ethers.parseEther("1"),
                })
            ).to.be.revertedWith("Incorrect ETH total");
        });
    });

    describe("transferTickets()", function () {
        it("should allow ticket owner to transfer a ticket successfully", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).transferTickets(addr2.address, [0]);
            expect(await onTix.ownerOf(0)).to.equal(addr2.address);
        });
        it("should emit TicketTransferred success event", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr1).transferTickets(addr2.address, [0])
            ).to.emit(onTix, "TicketTransferred")
                .withArgs(0, addr1.address, addr2.address);
        });
        it("should revert if sender is not the ticket owner", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).transferTickets(addr1.address, [0])
            ).to.be.revertedWith("Not owner");
        });
        it("should revert if ticket has already been resold", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).listForResale(0, ethers.parseEther("1"));
            await onTix.connect(addr2).buyResaleTickets([0], {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).transferTickets(addr1.address, [0])
            ).to.be.revertedWith("Already resold");
        });
        it("should revert if ticket expired", async function () {
            const { onTix, addr1, addr2, now, oneDay } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await ethers.provider.send("evm_setNextBlockTimestamp", [now + 4 * oneDay]);
            await ethers.provider.send("evm_mine");
            await expect(
                onTix.connect(addr1).transferTickets(addr2.address, [0])
            ).to.be.revertedWith("Ticket has expired");
        });
    });

    describe("validateTicket()", function () {
        it("should allow ticket owner to validate ticket successfully", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).validateTicket(0);
            const ticket = await onTix.ticketMetadata(0);
            expect(ticket.isUsed).to.equal(true);
        });
        it("should emit TicketValidated success event", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr1).validateTicket(0)
            ).to.emit(onTix, "TicketValidated").withArgs(0);
        });
        it("should revert if sender is not the ticket owner", async function () {
            const { onTix, addr1, addr2 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await expect(
                onTix.connect(addr2).validateTicket(0)
            ).to.be.revertedWith("Not ticket owner");
        });
        it("should revert if ticket already used", async function () {
            const { onTix, addr1 } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await onTix.connect(addr1).validateTicket(0);
            await expect(
                onTix.connect(addr1).validateTicket(0)
            ).to.be.revertedWith("Ticket already used");
        });
        it("should revert if ticket expired", async function () {
            const { onTix, addr1, now, oneDay } = await loadFixture(deployFixture);
            await onTix.connect(addr1).buyTickets(0, 1, {
                value: ethers.parseEther("1"),
            });
            await ethers.provider.send("evm_setNextBlockTimestamp", [now + 4 * oneDay]);
            await ethers.provider.send("evm_mine");
            await expect(
                onTix.connect(addr1).validateTicket(0)
            ).to.be.revertedWith("Ticket has expired");
        });
    });
});
